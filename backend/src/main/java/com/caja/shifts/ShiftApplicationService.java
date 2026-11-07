package com.caja.shifts;

import com.caja.audit.AuditService;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShiftApplicationService {
  private static final ZoneId OPERATING_ZONE = ZoneId.of("America/Bogota");

  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public ShiftApplicationService(JdbcTemplate jdbc, AuditService audit) {
    this.jdbc = jdbc;
    this.audit = audit;
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
        select coalesce(sum(s.total_pesos), 0)
        from sales s join payments p on p.sale_id = s.id
        where s.shift_id = ? and s.tenant_id = ? and s.location_id = ? and p.method = 'CASH'
        """, Long.class, shiftId, tenantId, locationId);
    var cashRefunds = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from refunds
        where shift_id = ? and tenant_id = ? and location_id = ? and method = 'CASH'
        """, Long.class, shiftId, tenantId, locationId);
    var deposits = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from cash_movements
        where shift_id = ? and tenant_id = ? and location_id = ? and type = 'DEPOSIT'
        """, Long.class, shiftId, tenantId, locationId);
    var withdrawals = jdbc.queryForObject("""
        select coalesce(sum(amount_pesos), 0) from cash_movements
        where shift_id = ? and tenant_id = ? and location_id = ? and type = 'WITHDRAWAL'
        """, Long.class, shiftId, tenantId, locationId);
    return opening + cashSales - cashRefunds + deposits - withdrawals;
  }

  @Transactional
  public Refund applyRefund(RefundCommand command) {
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
        command.shiftId(), command.deviceId(), command.userId(), command.reason(), saleTotal,
        command.method(), command.clientCreatedAt().atZone(OPERATING_ZONE).toLocalDate());
    jdbc.update("update sales set status = 'REFUNDED' where id = ? and tenant_id = ? and location_id = ?",
        command.saleId(), command.tenantId(), command.locationId());
    jdbc.update("update orders set status = 'REFUNDED' where sale_id = ? and tenant_id = ? and location_id = ?",
        command.saleId(), command.tenantId(), command.locationId());
    audit.record(command.tenantId(), command.locationId(), command.userId(), "REFUND_CREATED",
        "sale", command.saleId(),
        java.util.Map.of("amountPesos", saleTotal, "reason", command.reason()));
    return new Refund(refundId, command.saleId(), saleTotal, command.method());
  }

  @Transactional
  public ShiftClose close(CloseShiftCommand command) {
    var expected = expectedCash(command.tenantId(), command.locationId(), command.shiftId());
    var expectedLocal = command.expectedLocalPesos() == null ? expected
        : command.expectedLocalPesos();
    var difference = command.countedCashPesos() - expected;
    var updated = jdbc.update("""
        update shifts
        set closed_at = now(), counted_cash_pesos = ?, expected_local_pesos = ?,
            expected_server_pesos = ?, difference_pesos = ?, updated_at = now()
        where id = ? and tenant_id = ? and location_id = ? and closed_at is null
        """, command.countedCashPesos(), expectedLocal, expected, difference, command.shiftId(),
        command.tenantId(), command.locationId());
    if (updated == 0) {
      throw new IllegalStateException("El turno no existe o ya está cerrado");
    }
    audit.record(command.tenantId(), command.locationId(), command.userId(), "SHIFT_CLOSED", "shift",
        command.shiftId(),
        java.util.Map.of("expectedPesos", expected, "differencePesos", difference));
    return new ShiftClose(command.shiftId(), expected, difference);
  }

  @Transactional
  public void movement(UUID tenantId, UUID locationId, UUID shiftId, UUID userId, String type,
                        long amountPesos, String reason, LocalDate operationalDate) {
    jdbc.update("""
        insert into cash_movements(id, tenant_id, location_id, shift_id, user_id, type,
                                   amount_pesos, reason, operational_date)
        values (?, ?, ?, ?, ?, ?::cash_movement_type, ?, ?, ?)
        """, UUID.randomUUID(), tenantId, locationId, shiftId, userId, type, amountPesos, reason,
        operationalDate);
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
