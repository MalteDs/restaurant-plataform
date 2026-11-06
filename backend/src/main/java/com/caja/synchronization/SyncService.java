package com.caja.synchronization;

import com.caja.payments.PaymentMethod;
import com.caja.sales.CreateSaleCommand;
import com.caja.sales.SaleApplicationService;
import com.caja.sales.SaleType;
import com.caja.shifts.CloseShiftCommand;
import com.caja.shifts.OpenShiftCommand;
import com.caja.shifts.RefundCommand;
import com.caja.shifts.ShiftApplicationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SyncService {
  private static final ZoneId OPERATING_ZONE = ZoneId.of("America/Bogota");
  private static final Duration CLOCK_SKEW_LIMIT = Duration.ofMinutes(5);

  private final JdbcTemplate jdbc;
  private final ObjectMapper json;
  private final SaleApplicationService sales;
  private final ShiftApplicationService shifts;

  public SyncService(JdbcTemplate jdbc, ObjectMapper json, SaleApplicationService sales,
                     ShiftApplicationService shifts) {
    this.jdbc = jdbc;
    this.json = json;
    this.sales = sales;
    this.shifts = shifts;
  }

  @Transactional
  public List<SyncResult> push(SyncBatch batch) {
    var sorted = batch.operations().stream()
        .sorted(Comparator.comparingLong(SyncOperation::seq))
        .toList();

    var pending = new ArrayList<SyncOperation>();
    var expected = nextSeq(batch.deviceId());
    for (var operation : sorted) {
      if (findOperation(operation.operationId()) != null) {
        continue;
      }
      if (operation.seq() != expected) {
        return List.of(new SyncResult(operation.operationId(), SyncStatus.RETRY, Map.of(),
            "faltan operaciones anteriores"));
      }
      expected++;
      pending.add(operation);
    }

    var results = new ArrayList<SyncResult>();
    for (var operation : sorted) {
      var existing = findOperation(operation.operationId());
      if (existing != null) {
        if (!existing.hash().equals(hash(operation.payload()))) {
          results.add(new SyncResult(operation.operationId(), SyncStatus.REJECTED, Map.of(),
              "la operacion ya se sincronizo con otro contenido"));
        } else {
          results.add(new SyncResult(operation.operationId(), SyncStatus.DUPLICATE,
              existing.result(), null));
        }
        continue;
      }
      results.add(apply(operation, batch));
    }
    return results;
  }

  private SyncResult apply(SyncOperation operation, SyncBatch batch) {
    var hash = hash(operation.payload());
    var clockSkew = Math.abs(Duration.between(operation.clientCreatedAt(), Instant.now())
        .toMinutes()) > CLOCK_SKEW_LIMIT.toMinutes();
    try {
      var outcome = dispatch(operation, batch);
      record(operation, batch, hash, outcome.entityId(), outcome.result(), clockSkew, null);
      return new SyncResult(operation.operationId(), SyncStatus.APPLIED, outcome.result(), null);
    } catch (IllegalStateException e) {
      record(operation, batch, hash, null, Map.of("error", e.getMessage()), clockSkew, e.getMessage());
      return new SyncResult(operation.operationId(), SyncStatus.REJECTED, Map.of(), e.getMessage());
    }
  }

  private Outcome dispatch(SyncOperation operation, SyncBatch batch) {
    var payload = operation.payload();
    return switch (operation.type()) {
      case "CREATE_SALE" -> {
        var sale = sales.apply(toSaleCommand(operation, batch));
        yield new Outcome(sale.id(), Map.of(
            "id", sale.id().toString(),
            "displayCode", sale.displayCode(),
            "totalPesos", sale.totalPesos()));
      }
      case "REFUND_SALE" -> {
        var refund = shifts.applyRefund(new RefundCommand(batch.tenantId(), batch.locationId(),
            batch.deviceId(), operation.userId(), uuid(payload.get("shiftId")),
            uuid(payload.get("saleId")), (String) payload.getOrDefault("method", "CASH"),
            (String) payload.get("reason"), operation.clientCreatedAt()));
        yield new Outcome(refund.id(), Map.of(
            "id", refund.id().toString(),
            "saleId", refund.saleId().toString(),
            "amountPesos", refund.amountPesos()));
      }
      case "OPEN_SHIFT" -> {
        var shiftId = shifts.open(new OpenShiftCommand(batch.tenantId(), batch.locationId(),
            batch.deviceId(), operation.userId(),
            ((Number) payload.get("openingCashPesos")).longValue(),
            LocalDate.now(OPERATING_ZONE)));
        yield new Outcome(shiftId, Map.of("shiftId", shiftId.toString()));
      }
      case "CASH_MOVEMENT" -> {
        shifts.movement(batch.tenantId(), batch.locationId(), uuid(payload.get("shiftId")),
            operation.userId(), (String) payload.get("movementType"),
            ((Number) payload.get("amountPesos")).longValue(), (String) payload.get("reason"));
        yield new Outcome(null, Map.of("ok", true));
      }
      case "CLOSE_SHIFT" -> {
        var close = shifts.close(new CloseShiftCommand(batch.tenantId(), batch.locationId(),
            uuid(payload.get("shiftId")), ((Number) payload.get("countedCashPesos")).longValue()));
        yield new Outcome(close.shiftId(), Map.of(
            "shiftId", close.shiftId().toString(),
            "expectedPesos", close.expectedPesos(),
            "differencePesos", close.differencePesos()));
      }
      default -> throw new IllegalStateException("Tipo de operacion no soportado: "
          + operation.type());
    };
  }

  @SuppressWarnings("unchecked")
  private CreateSaleCommand toSaleCommand(SyncOperation operation, SyncBatch batch) {
    var payload = operation.payload();
    var items = new ArrayList<CreateSaleCommand.ItemCommand>();
    for (Map<String, Object> item : (List<Map<String, Object>>) payload.getOrDefault("items", List.of())) {
      var modifiers = new ArrayList<CreateSaleCommand.ModifierCommand>();
      for (Map<String, Object> modifier : (List<Map<String, Object>>) item.getOrDefault("modifiers",
          List.of())) {
        modifiers.add(new CreateSaleCommand.ModifierCommand(
            uuid(modifier.get("modifierId")), (String) modifier.get("modifierName"),
            ((Number) modifier.get("additionalPricePesos")).longValue()));
      }
      var components = new ArrayList<CreateSaleCommand.ComponentCommand>();
      for (Map<String, Object> component : (List<Map<String, Object>>) item.getOrDefault("components",
          List.of())) {
        components.add(new CreateSaleCommand.ComponentCommand(uuid(component.get("productId")),
            (String) component.get("name"), ((Number) component.get("quantity")).intValue()));
      }
      items.add(new CreateSaleCommand.ItemCommand(uuid(item.get("productId")),
          (String) item.get("productName"), (String) item.get("categoryName"),
          ((Number) item.get("quantity")).intValue(),
          ((Number) item.get("unitPricePesos")).longValue(),
          item.get("costPesos") == null ? null : ((Number) item.get("costPesos")).longValue(),
          (String) item.get("note"), modifiers, components));
    }
    return new CreateSaleCommand(batch.tenantId(), batch.locationId(), batch.deviceId(),
        operation.userId(), uuid(payload.get("shiftId")),
        SaleType.valueOf((String) payload.get("type")), (String) payload.get("tableLabel"),
        ((Number) payload.getOrDefault("deliveryFeePesos", 0)).longValue(), items,
        PaymentMethod.valueOf((String) payload.get("method")), operation.operationId(),
        (String) payload.get("displayCode"),
        ((Number) payload.get("deviceSeq")).longValue(), operation.clientCreatedAt());
  }

  private void record(SyncOperation operation, SyncBatch batch, String hash, UUID entityId,
                      Map<String, Object> result, boolean clockSkew, String error) {
    var resultJson = error == null ? result : Map.of("error", error);
    jdbc.update("""
        insert into sync_operations(operation_id, tenant_id, location_id, device_id, user_id, seq,
                                    type, entity_id, payload_hash, result_json, client_created_at,
                                    server_received_at, applied_at, clock_skew)
        values (?, ?, ?, ?, ?, ?, ?::sync_operation_type, ?, ?, ?::jsonb, ?, now(), ?, ?)
        """, operation.operationId(), batch.tenantId(), batch.locationId(), batch.deviceId(),
        operation.userId(), operation.seq(), operation.type(), entityId, hash,
        json.valueToTree(resultJson).toString(), Timestamp.from(operation.clientCreatedAt()),
        error == null ? Timestamp.from(Instant.now()) : null, clockSkew);
  }

  private long nextSeq(UUID deviceId) {
    var last = jdbc.queryForObject(
        "select coalesce(max(seq), 0) from sync_operations where device_id = ?", Long.class,
        deviceId);
    return last == null ? 1 : last + 1;
  }

  private ExistingOperation findOperation(UUID operationId) {
    return jdbc.query("""
        select payload_hash, result_json
        from sync_operations
        where operation_id = ?
        """, (rs, rowNum) -> {
          try {
            return new ExistingOperation(rs.getString("payload_hash"),
                json.readValue(rs.getString("result_json"), Map.class));
          } catch (Exception e) {
            throw new IllegalStateException("No se pudo leer la operacion sincronizada", e);
          }
        }, operationId)
        .stream().findFirst().orElse(null);
  }

  private String hash(Map<String, Object> payload) {
    try {
      var canonical = json.writer().with(com.fasterxml.jackson.databind.SerializationFeature
          .ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsString(payload);
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(canonical.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("No se pudo calcular el hash del payload", e);
    }
  }

  private UUID uuid(Object value) {
    if (value == null) {
      return null;
    }
    return value instanceof UUID id ? id : UUID.fromString(value.toString());
  }

  private record Outcome(UUID entityId, Map<String, Object> result) {
  }

  private record ExistingOperation(String hash, Map<String, Object> result) {
  }
}
