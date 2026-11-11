package com.caja.shifts;

import com.caja.audit.AuditService;
import com.caja.expenses.ExpenseService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShiftApplicationService {
  private static final ZoneId OPERATING_ZONE = ZoneId.of("America/Bogota");
  private static final Set<Integer> DENOMINATIONS = Set.of(
      100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50);

  private final JdbcTemplate jdbc;
  private final AuditService audit;
  private final ExpenseService expenses;
  private final ObjectMapper json;

  public ShiftApplicationService(JdbcTemplate jdbc, AuditService audit, ExpenseService expenses,
                                 ObjectMapper json) {
    this.jdbc = jdbc;
    this.audit = audit;
    this.expenses = expenses;
    this.json = json;
  }

  public static void validateClose(long countedCashPesos, Map<Integer, Integer> breakdown,
                                   String closeNote) {
    if (closeNote != null && !closeNote.isBlank()) {
      var note = closeNote.trim();
      if (note.length() < 5 || note.length() > 200) {
        throw new IllegalArgumentException(
            "La nota del cierre debe tener entre 5 y 200 caracteres");
      }
    }
    if (breakdown == null || breakdown.isEmpty()) {
      return;
    }
    long total = 0;
    for (var entry : breakdown.entrySet()) {
      if (!DENOMINATIONS.contains(entry.getKey())) {
        throw new IllegalArgumentException("Denominacion no valida");
      }
      if (entry.getValue() == null || entry.getValue() < 0) {
        throw new IllegalArgumentException("La cantidad no puede ser negativa");
      }
      total += (long) entry.getKey() * entry.getValue();
    }
    if (total != countedCashPesos) {
      throw new IllegalArgumentException("El desglose no suma el efectivo contado");
    }
  }

  @Transactional
  public UUID open(OpenShiftCommand command) {
    var alreadyOpen = jdbc.queryForObject("""
        select count(*) from shifts
        where tenant_id = ? and location_id = ? and device_id = ? and closed_at is null
        """, Integer.class, command.tenantId(), command.locationId(), command.deviceId());
    if (alreadyOpen != null && alreadyOpen > 0) {
      throw new IllegalStateException("El dispositivo ya tiene un turno abierto");
    }
    var existing = jdbc.query("select id from shifts where id = ? and tenant_id = ?",
        (rs, rowNum) -> rs.getObject("id", UUID.class), command.shiftId(), command.tenantId())
        .stream().findFirst();
    if (existing.isPresent()) {
      return existing.get();
    }
    jdbc.update("""
        insert into shifts(id, tenant_id, location_id, device_id, user_id, opening_cash_pesos,
                           operational_date)
        values (?, ?, ?, ?, ?, ?, ?)
        """, command.shiftId(), command.tenantId(), command.locationId(), command.deviceId(),
        command.userId(), command.openingCashPesos(), command.operationalDate());
    return command.shiftId();
  }

  /** Cash the drawer should hold: opening + cash sales - cash refunds + deposits - withdrawals. */
  public long expectedCash(UUID tenantId, UUID locationId, UUID shiftId) {
    var opening = jdbc.queryForObject("""
        select opening_cash_pesos from shifts
        where id = ? and tenant_id = ? and location_id = ?
        """, Long.class, shiftId, tenantId, locationId);
    var cashSales = jdbc.queryForObject("""
        select coalesce(sum(p.amount_pesos), 0)
        from payments p
        join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
                    and s.location_id = p.location_id
        where s.shift_id = ? and s.tenant_id = ? and s.location_id = ? and p.method = 'CASH'
        """, Long.class, shiftId, tenantId, locationId);
    var cashRefunds = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from refunds
        where shift_id = ? and tenant_id = ? and location_id = ? and method = 'CASH'
        """, Long.class, shiftId, tenantId, locationId);
    var deposits = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from cash_movements
        where shift_id = ? and tenant_id = ? and location_id = ? and type = 'DEPOSIT'
          and voided_at is null
        """, Long.class, shiftId, tenantId, locationId);
    var withdrawals = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from cash_movements
        where shift_id = ? and tenant_id = ? and location_id = ? and type = 'WITHDRAWAL'
          and voided_at is null
        """, Long.class, shiftId, tenantId, locationId);
    return opening + cashSales - cashRefunds + deposits - withdrawals;
  }

  @Transactional
  public Refund applyRefund(RefundCommand command) {
    var reason = command.reason() == null ? "" : command.reason().trim();
    if (reason.length() < 5 || reason.length() > 200) {
      throw new IllegalArgumentException(
          "El motivo de la devolución debe tener entre 5 y 200 caracteres");
    }
    requireOpenShift(command);
    var saleTotal = jdbc.query("""
        select total_pesos from sales
        where id = ? and tenant_id = ? and location_id = ?
        """, (rs, rowNum) -> rs.getLong("total_pesos"), command.saleId(), command.tenantId(),
        command.locationId()).stream().findFirst()
        .orElseThrow(() -> new IllegalStateException("La venta no existe"));
    var refunded = jdbc.queryForObject("""
        select count(*) from refunds where sale_id = ? and tenant_id = ? and location_id = ?
        """, Integer.class, command.saleId(), command.tenantId(), command.locationId());
    if (refunded != null && refunded > 0) {
      throw new IllegalStateException("La venta ya fue devuelta");
    }

    var refundId = UUID.randomUUID();
    jdbc.update("""
        insert into refunds(id, tenant_id, location_id, sale_id, shift_id, device_id, user_id,
                            reason, amount_pesos, method, operational_date)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::payment_method, ?)
        """, refundId, command.tenantId(), command.locationId(), command.saleId(),
        command.shiftId(), command.deviceId(), command.userId(), reason, saleTotal,
        command.method(), command.clientCreatedAt().atZone(OPERATING_ZONE).toLocalDate());
    jdbc.update("update sales set status = 'REFUNDED' where id = ? and tenant_id = ? and location_id = ?",
        command.saleId(), command.tenantId(), command.locationId());
    jdbc.update("update orders set status = 'REFUNDED' where sale_id = ? and tenant_id = ? and location_id = ?",
        command.saleId(), command.tenantId(), command.locationId());
    audit.record(command.tenantId(), command.locationId(), command.userId(), "REFUND_CREATED",
        "sale", command.saleId(),
        java.util.Map.of("amountPesos", saleTotal, "reason", reason));
    return new Refund(refundId, command.saleId(), saleTotal, command.method());
  }

  @Transactional
  public ShiftClose close(CloseShiftCommand command) {
    validateClose(command.countedCashPesos(), command.countedBreakdown(), command.closeNote());
    var expected = expectedCash(command.tenantId(), command.locationId(), command.shiftId());
    var expectedLocal = command.expectedLocalPesos() == null ? expected
        : command.expectedLocalPesos();
    var difference = command.countedCashPesos() - expected;
    var breakdownJson = command.countedBreakdown() == null || command.countedBreakdown().isEmpty()
        ? null : json.valueToTree(command.countedBreakdown()).toString();
    var note = command.closeNote() == null || command.closeNote().isBlank()
        ? null : command.closeNote().trim();
    var updated = jdbc.update("""
        update shifts
        set closed_at = now(), counted_cash_pesos = ?, expected_local_pesos = ?,
            expected_server_pesos = ?, difference_pesos = ?, counted_breakdown = ?::jsonb,
            close_note = ?, updated_at = now()
        where id = ? and tenant_id = ? and location_id = ? and closed_at is null
        """, command.countedCashPesos(), expectedLocal, expected, difference, breakdownJson, note,
        command.shiftId(), command.tenantId(), command.locationId());
    if (updated == 0) {
      throw new IllegalStateException("El turno no existe o ya está cerrado");
    }
    audit.record(command.tenantId(), command.locationId(), command.userId(), "SHIFT_CLOSED", "shift",
        command.shiftId(),
        java.util.Map.of("expectedPesos", expected, "differencePesos", difference));
    return new ShiftClose(command.shiftId(), expected, difference);
  }

  @Transactional
  public void movement(CashMovementCommand command) {
    requireOpenShift(command.tenantId(), command.locationId(), command.shiftId());

    UUID replacedId = null;
    if (command.replacesMovementId() != null) {
      replacedId = jdbc.query("""
          select id from cash_movements
          where id = ? and tenant_id = ? and location_id = ? and shift_id = ?
            and voided_at is null
          """, (rs, rowNum) -> rs.getObject("id", UUID.class), command.replacesMovementId(),
          command.tenantId(), command.locationId(), command.shiftId())
          .stream().findFirst().orElse(null);
      if (replacedId != null) {
        jdbc.update("""
            update cash_movements set voided_at = now(), voided_by = ?
            where id = ? and tenant_id = ? and location_id = ?
            """, command.userId(), replacedId, command.tenantId(), command.locationId());
        expenses.voidByCashMovement(command.tenantId(), command.locationId(), command.userId(),
            replacedId);
        audit.record(command.tenantId(), command.locationId(), command.userId(),
            "CASH_MOVEMENT_VOIDED", "cash_movement", replacedId,
            java.util.Map.of("replacedBy", String.valueOf(command.movementId())));
      }
      if (command.voided()) {
        return;
      }
    }

    if (!"DEPOSIT".equals(command.type()) && !"WITHDRAWAL".equals(command.type())) {
      throw new IllegalArgumentException("El tipo de movimiento no es valido");
    }
    var reason = command.reason() == null ? "" : command.reason().trim();
    if (reason.length() < 5 || reason.length() > 200) {
      throw new IllegalArgumentException("El motivo debe tener entre 5 y 200 caracteres");
    }
    if (command.amountPesos() <= 0) {
      throw new IllegalArgumentException("El monto debe ser mayor que cero");
    }

    jdbc.update("""
        insert into cash_movements(id, tenant_id, location_id, shift_id, user_id, type,
                                   amount_pesos, reason, operational_date, replaces_movement_id)
        values (?, ?, ?, ?, ?, ?::cash_movement_type, ?, ?, ?, ?)
        """, command.movementId(), command.tenantId(), command.locationId(), command.shiftId(),
        command.userId(), command.type(), command.amountPesos(), reason, command.operationalDate(),
        replacedId);
    audit.record(command.tenantId(), command.locationId(), command.userId(),
        replacedId == null ? "CASH_MOVEMENT_CREATED" : "CASH_MOVEMENT_CORRECTED",
        "cash_movement", command.movementId(),
        java.util.Map.of("type", command.type(), "amountPesos", command.amountPesos(),
            "reason", reason));
    if (command.expenseCategoryName() != null && !command.expenseCategoryName().isBlank()) {
      expenses.createFromCashMovement(command.tenantId(), command.locationId(), command.userId(),
          command.movementId(), command.expenseCategoryName(), reason, command.amountPesos(),
          command.operationalDate());
    }
  }

  private void requireOpenShift(UUID tenantId, UUID locationId, UUID shiftId) {
    var open = jdbc.queryForObject("""
        select count(*) from shifts
        where id = ? and tenant_id = ? and location_id = ? and closed_at is null
        """, Integer.class, shiftId, tenantId, locationId);
    if (open == null || open == 0) {
      throw new IllegalStateException("No hay turno abierto");
    }
  }

  private void requireOpenShift(RefundCommand command) {
    var open = jdbc.queryForObject("""
        select count(*) from shifts
        where id = ? and tenant_id = ? and location_id = ? and device_id = ? and closed_at is null
        """, Integer.class, command.shiftId(), command.tenantId(), command.locationId(),
        command.deviceId());
    if (open == null || open == 0) {
      throw new IllegalStateException("No hay turno abierto para este dispositivo");
    }
  }
}
