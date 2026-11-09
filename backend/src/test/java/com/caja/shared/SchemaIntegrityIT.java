package com.caja.shared;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Testcontainers
class SchemaIntegrityIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired JdbcTemplate jdbc;

  @Test void createsAllApprovedTables() {
    var expected = Set.of(
        "tenants", "locations", "users", "devices", "categories", "products", "modifier_groups",
        "modifiers", "product_modifier_groups", "combo_components", "shifts", "sales", "sale_items",
        "sale_item_modifiers", "sale_item_components", "payments", "cash_movements", "refunds",
        "expenses", "expense_categories", "orders", "order_items", "sync_operations",
        "audit_events");
    var actual = new HashSet<>(jdbc.queryForList(
        "select table_name from information_schema.tables where table_schema = 'public'", String.class));
    assertTrue(actual.containsAll(expected), () -> "Faltan tablas: " + expected.stream()
        .filter(table -> !actual.contains(table)).toList());
  }

  @Test void refundMustEqualTheSaleTotal() {
    var ctx = fixture();
    var saleId = insertSale(ctx, 16500, "ALM-A-000001", 1);

    assertThrows(DataAccessException.class, () -> insertRefund(ctx, saleId, 16499));
    assertThrows(DataAccessException.class, () -> insertRefund(ctx, saleId, 16501));

    insertRefund(ctx, saleId, 16500);
    assertEquals(1, jdbc.queryForObject("select count(*) from refunds", Integer.class));
  }

  @Test void auditEventsAreAppendOnly() {
    var ctx = fixture();
    var eventId = UUID.randomUUID();
    jdbc.update("insert into audit_events(id, tenant_id, location_id, event_type, entity_type) "
        + "values (?, ?, ?, 'SALE_CREATED', 'sale')", eventId, ctx.tenantId(), ctx.locationId());

    assertThrows(DataAccessException.class,
        () -> jdbc.update("update audit_events set event_type = 'TAMPERED' where id = ?", eventId));
    assertThrows(DataAccessException.class,
        () -> jdbc.update("delete from audit_events where id = ?", eventId));
    assertThrows(DataAccessException.class, () -> jdbc.execute("truncate audit_events"));
    assertEquals(1, jdbc.queryForObject("select count(*) from audit_events", Integer.class));
  }

  @Test void onlyOneOpenShiftPerDevice() {
    var ctx = fixture();
    var firstShift = insertShift(ctx);

    assertThrows(DataAccessException.class, () -> insertShift(ctx));

    jdbc.update("update shifts set closed_at = now() where id = ?", firstShift);
    insertShift(ctx);
    assertEquals(1, jdbc.queryForObject(
        "select count(*) from shifts where closed_at is null and device_id = ?",
        Integer.class, ctx.deviceId()));
  }

  @Test void shiftCloseCanRecordNegativeExpectedCash() {
    var ctx = fixture();
    var shiftId = insertShift(ctx);

    jdbc.update("update shifts set closed_at = now(), expected_local_pesos = -1000, "
        + "expected_server_pesos = -1000, difference_pesos = 0 where id = ?", shiftId);

    assertEquals(-1000L, jdbc.queryForObject(
        "select expected_server_pesos from shifts where id = ?", Long.class, shiftId).longValue());
  }

  private record Ctx(UUID tenantId, UUID locationId, UUID userId, UUID deviceId) {
  }

  private Ctx fixture() {
    var tenantId = UUID.randomUUID();
    var locationId = UUID.randomUUID();
    var userId = UUID.randomUUID();
    var deviceId = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", tenantId, "Karbon");
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, 'ALM', 'Almendros')",
        locationId, tenantId);
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, 'ana', 'hash', 'CASHIER')", userId, tenantId, locationId);
    jdbc.update("insert into devices(id, tenant_id, location_id, code, name, token_hash, status) "
        + "values (?, ?, ?, 'A', 'Caja A', 'hash', 'ACTIVE')", deviceId, tenantId, locationId);
    return new Ctx(tenantId, locationId, userId, deviceId);
  }

  private UUID insertShift(Ctx ctx) {
    var shiftId = UUID.randomUUID();
    jdbc.update("insert into shifts(id, tenant_id, location_id, device_id, user_id, "
        + "opening_cash_pesos, operational_date) values (?, ?, ?, ?, ?, 50000, current_date)",
        shiftId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId());
    return shiftId;
  }

  private UUID insertSale(Ctx ctx, long totalPesos, String displayCode, long deviceSeq) {
    var saleId = UUID.randomUUID();
    var shiftId = insertShift(ctx);
    jdbc.update("insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type, "
        + "total_pesos, display_code, device_seq, operational_date, client_created_at) "
        + "values (?, ?, ?, ?, ?, ?, 'COUNTER', ?, ?, ?, current_date, now())",
        saleId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), shiftId,
        totalPesos, displayCode, deviceSeq);
    return saleId;
  }

  private void insertRefund(Ctx ctx, UUID saleId, long amountPesos) {
    jdbc.update("insert into refunds(id, tenant_id, location_id, sale_id, shift_id, device_id, "
        + "user_id, reason, amount_pesos, method, operational_date) "
        + "values (?, ?, ?, ?, (select id from shifts where tenant_id = ? and location_id = ? "
        + "and device_id = ? order by opened_at desc limit 1), ?, ?, 'cliente', ?, 'CASH', current_date)",
        UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), saleId, ctx.tenantId(),
        ctx.locationId(), ctx.deviceId(), ctx.deviceId(), ctx.userId(), amountPesos);
  }
}
