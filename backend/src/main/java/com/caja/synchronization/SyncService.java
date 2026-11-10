package com.caja.synchronization;

import com.caja.payments.PaymentMethod;
import com.caja.sales.CreateSaleCommand;
import com.caja.sales.SaleApplicationService;
import com.caja.sales.SaleType;
import com.caja.shifts.CashMovementCommand;
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
    var expected = nextSeq(batch);
    for (var operation : sorted) {
      if (findOperation(operation.operationId(), batch) != null) {
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
      var existing = findOperation(operation.operationId(), batch);
      if (existing != null) {
        if (!existing.hash().equals(hash(operation.payload()))) {
          results.add(new SyncResult(operation.operationId(), SyncStatus.REJECTED, Map.of(),
              "la operacion ya se sincronizo con otro contenido"));
        } else if (!existing.applied()) {
          results.add(new SyncResult(operation.operationId(), SyncStatus.REJECTED,
              existing.result(), String.valueOf(existing.result().getOrDefault("error",
              "la operacion fue rechazada"))));
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
      validate(operation, batch);
      var outcome = dispatch(operation, batch);
      record(operation, batch, hash, outcome.entityId(), outcome.result(), clockSkew, null);
      return new SyncResult(operation.operationId(), SyncStatus.APPLIED, outcome.result(), null);
    } catch (IllegalStateException | IllegalArgumentException e) {
      record(operation, batch, hash, null, Map.of("error", e.getMessage()), clockSkew, e.getMessage());
      return new SyncResult(operation.operationId(), SyncStatus.REJECTED, Map.of(), e.getMessage());
    }
  }

  private void validate(SyncOperation operation, SyncBatch batch) {
    if (!"CREATE_SALE".equals(operation.type()) && !"REFUND_SALE".equals(operation.type())
        && !"CASH_MOVEMENT".equals(operation.type())
        && !"CLOSE_SHIFT".equals(operation.type())) {
      return;
    }
    var payload = operation.payload();
    var open = jdbc.queryForObject("""
        select count(*) from shifts
        where id = ? and tenant_id = ? and location_id = ? and device_id = ? and closed_at is null
        """, Integer.class, uuid(payload.get("shiftId")), batch.tenantId(), batch.locationId(),
        batch.deviceId());
    if (open == null || open == 0) {
      throw new IllegalStateException("No hay turno abierto para este dispositivo");
    }
    if ("CASH_MOVEMENT".equals(operation.type())) {
      var voided = Boolean.TRUE.equals(payload.get("voided"));
      if (voided) {
        if (payload.get("replacesMovementId") == null) {
          throw new IllegalStateException("Falta el movimiento a anular");
        }
      } else {
        var type = payload.get("movementType");
        if (!"DEPOSIT".equals(type) && !"WITHDRAWAL".equals(type)) {
          throw new IllegalArgumentException("El tipo de movimiento no es valido");
        }
        var reason = payload.get("reason") instanceof String text ? text.trim() : "";
        if (reason.length() < 5 || reason.length() > 200) {
          throw new IllegalArgumentException("El motivo debe tener entre 5 y 200 caracteres");
        }
        var amount = payload.get("amountPesos");
        if (!(amount instanceof Number number) || number.longValue() <= 0) {
          throw new IllegalArgumentException("El monto debe ser mayor que cero");
        }
      }
    }
    if ("CLOSE_SHIFT".equals(operation.type())) {
      var counted = ((Number) payload.get("countedCashPesos")).longValue();
      ShiftApplicationService.validateClose(counted, toBreakdown(payload.get("countedBreakdown")),
          (String) payload.get("closeNote"));
    }
    if ("CREATE_SALE".equals(operation.type())) {
      var command = toSaleCommand(operation, batch);
      var overrides = command.items().stream()
          .filter(item -> item.unitPricePesos() != item.catalogUnitPricePesos())
          .map(item -> new SaleApplicationService.PriceOverride(item.unitPricePesos(),
              item.catalogUnitPricePesos(), item.overrideReason()))
          .toList();
      sales.validatePriceOverrides(batch.tenantId(), batch.locationId(), operation.userId(),
          overrides);
      sales.validatePayments(command.payments(), command.totalPesos());
    }
    if ("REFUND_SALE".equals(operation.type())) {
      var reason = payload.get("reason") instanceof String text ? text.trim() : "";
      if (reason.length() < 5 || reason.length() > 200) {
        throw new IllegalStateException(
            "El motivo de la devolución debe tener entre 5 y 200 caracteres");
      }
      var refunded = jdbc.queryForObject("select count(*) from refunds where sale_id = ?",
          Integer.class, uuid(payload.get("saleId")));
      if (refunded != null && refunded > 0) {
        throw new IllegalStateException("La venta ya fue devuelta");
      }
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
        var shiftId = shifts.open(new OpenShiftCommand(uuid(payload.get("shiftId")),
            batch.tenantId(), batch.locationId(), batch.deviceId(), operation.userId(),
            ((Number) payload.get("openingCashPesos")).longValue(),
            operation.clientCreatedAt().atZone(OPERATING_ZONE).toLocalDate()));
        yield new Outcome(shiftId, Map.of("shiftId", shiftId.toString()));
      }
      case "CASH_MOVEMENT" -> {
        var movementId = operation.entityId() == null ? UUID.randomUUID() : operation.entityId();
        var replaces = payload.get("replacesMovementId") == null ? null
            : uuid(payload.get("replacesMovementId"));
        var amount = payload.get("amountPesos") == null ? 0
            : ((Number) payload.get("amountPesos")).longValue();
        shifts.movement(new CashMovementCommand(batch.tenantId(), batch.locationId(),
            uuid(payload.get("shiftId")), operation.userId(), movementId,
            (String) payload.get("movementType"), amount, (String) payload.get("reason"),
            (String) payload.get("expenseCategoryName"), replaces,
            Boolean.TRUE.equals(payload.get("voided")),
            operation.clientCreatedAt().atZone(OPERATING_ZONE).toLocalDate()));
        yield new Outcome(movementId, Map.of("movementId", movementId.toString()));
      }
      case "CLOSE_SHIFT" -> {
        var close = shifts.close(new CloseShiftCommand(batch.tenantId(), batch.locationId(),
            uuid(payload.get("shiftId")), ((Number) payload.get("countedCashPesos")).longValue(),
            payload.get("expectedPesos") == null ? null
                : ((Number) payload.get("expectedPesos")).longValue(),
            operation.userId(), toBreakdown(payload.get("countedBreakdown")),
            (String) payload.get("closeNote")));
        yield new Outcome(close.shiftId(), Map.of(
            "shiftId", close.shiftId().toString(),
            "expectedPesos", close.expectedPesos(),
            "differencePesos", close.differencePesos()));
      }
      default -> throw new IllegalStateException("Tipo de operacion no soportado: "
          + operation.type());
    };
  }

  private Map<Integer, Integer> toBreakdown(Object raw) {
    if (!(raw instanceof Map<?, ?> map) || map.isEmpty()) {
      return null;
    }
    var result = new java.util.LinkedHashMap<Integer, Integer>();
    for (var entry : map.entrySet()) {
      result.put(Integer.parseInt(String.valueOf(entry.getKey())),
          ((Number) entry.getValue()).intValue());
    }
    return result;
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
      var unitPrice = ((Number) item.get("unitPricePesos")).longValue();
      var catalogPrice = item.get("catalogUnitPricePesos") == null ? unitPrice
          : ((Number) item.get("catalogUnitPricePesos")).longValue();
      items.add(new CreateSaleCommand.ItemCommand(uuid(item.get("productId")),
          (String) item.get("productName"), (String) item.get("categoryName"),
          ((Number) item.get("quantity")).intValue(), unitPrice,
          item.get("costPesos") == null ? null : ((Number) item.get("costPesos")).longValue(),
          (String) item.get("note"), modifiers, components, catalogPrice,
          (String) item.get("overrideReason")));
    }
    var deliveryFee = ((Number) payload.getOrDefault("deliveryFeePesos", 0)).longValue();
    var payments = new ArrayList<CreateSaleCommand.PaymentCommand>();
    var rawPayments = (List<Map<String, Object>>) payload.get("payments");
    if (rawPayments != null && !rawPayments.isEmpty()) {
      for (Map<String, Object> payment : rawPayments) {
        payments.add(new CreateSaleCommand.PaymentCommand(
            PaymentMethod.valueOf((String) payment.get("method")),
            ((Number) payment.get("amountPesos")).longValue()));
      }
    } else {
      payments.add(new CreateSaleCommand.PaymentCommand(
          PaymentMethod.valueOf((String) payload.get("method")),
          CreateSaleCommand.totalOf(items, deliveryFee)));
    }
    return new CreateSaleCommand(operation.entityId(), batch.tenantId(), batch.locationId(),
        batch.deviceId(), operation.userId(), uuid(payload.get("shiftId")),
        SaleType.valueOf((String) payload.get("type")), (String) payload.get("tableLabel"),
        deliveryFee, items, payments, operation.operationId(),
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

  private long nextSeq(SyncBatch batch) {
    var last = jdbc.queryForObject("""
        select coalesce(max(seq), 0) from sync_operations
        where device_id = ? and tenant_id = ? and location_id = ?
        """, Long.class, batch.deviceId(), batch.tenantId(), batch.locationId());
    return last == null ? 1 : last + 1;
  }

  private ExistingOperation findOperation(UUID operationId, SyncBatch batch) {
    return jdbc.query("""
        select payload_hash, result_json, applied_at
        from sync_operations
        where operation_id = ? and tenant_id = ? and location_id = ?
        """, (rs, rowNum) -> {
          try {
            return new ExistingOperation(rs.getString("payload_hash"),
                json.readValue(rs.getString("result_json"), Map.class),
                rs.getTimestamp("applied_at") != null);
          } catch (Exception e) {
            throw new IllegalStateException("No se pudo leer la operacion sincronizada", e);
          }
        }, operationId, batch.tenantId(), batch.locationId()).stream().findFirst().orElse(null);
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

  private record ExistingOperation(String hash, Map<String, Object> result, boolean applied) {
  }
}
