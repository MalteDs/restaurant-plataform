package com.caja.synchronization;

import com.caja.shifts.ShiftApplicationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SyncIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;
  @Autowired ShiftApplicationService shifts;

  @Test void retryReturnsSameSale() throws Exception {
    var ctx = fixture();
    var operation = saleOperation(ctx, "op-1", 1, 16500, Instant.now());

    var first = push(ctx, List.of(operation));
    assertEquals("APPLIED", syncStatus(first.get(0)));
    var second = push(ctx, List.of(operation));
    assertEquals("DUPLICATE", syncStatus(second.get(0)));
    assertEquals(result(first.get(0), "id"), result(second.get(0), "id"));
    assertEquals(1, countSales(ctx));
  }

  @Test void saleBeforeShiftReturnsRetry() throws Exception {
    var ctx = fixture();
    var operation = saleOperation(ctx, "op-2", 2, 16500, Instant.now());

    var result = push(ctx, List.of(operation));

    assertEquals("RETRY", syncStatus(result.get(0)));
    assertEquals(0, countSales(ctx));
  }

  @Test void sameOperationWithAnotherPayloadIsRejected() throws Exception {
    var ctx = fixture();
    push(ctx, List.of(saleOperation(ctx, "op-3", 1, 16500, Instant.now())));

    var changed = saleOperation(ctx, "op-3", 1, 20000, Instant.now());
    var result = push(ctx, List.of(changed));

    assertEquals("REJECTED", syncStatus(result.get(0)));
    assertEquals(1, countSales(ctx));
  }

  @Test void clockSkewIsMarkedButTheOperationIsApplied() throws Exception {
    var ctx = fixture();
    var old = Instant.now().minusSeconds(3600);

    var result = push(ctx, List.of(saleOperation(ctx, "op-4", 1, 16500, old)));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertTrue(jdbc.queryForObject(
        "select clock_skew from sync_operations where operation_id = ?", Boolean.class,
        UUID.nameUUIDFromBytes("op-4".getBytes(StandardCharsets.UTF_8))));
  }

  @Test void rejectedOperationStaysRejectedOnRetry() throws Exception {
    var ctx = fixture();
    jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());
    var operation = saleOperation(ctx, "op-rejected", 1, 16500, Instant.now());

    var first = push(ctx, List.of(operation));
    var second = push(ctx, List.of(operation));

    assertEquals("REJECTED", syncStatus(first.get(0)));
    assertEquals("REJECTED", syncStatus(second.get(0)));
    assertEquals(0, countSales(ctx));
  }

  @Test void cashierCannotOverridePriceThroughSync() throws Exception {
    var ctx = fixture();
    var operation = saleOperation(ctx, "op-override-cashier", 1, 14000, 16500,
        "descuento autorizado", Instant.now());

    var result = push(ctx, List.of(operation));

    assertEquals("REJECTED", syncStatus(result.get(0)));
    assertEquals(0, countSales(ctx));
  }

  @Test void managerOverrideThroughSyncIsApplied() throws Exception {
    var ctx = fixture();
    jdbc.update("update users set role = 'MANAGER' where id = ?", ctx.userId());
    var operation = saleOperation(ctx, "op-override-manager", 1, 14000, 16500,
        "descuento autorizado", Instant.now());

    var result = push(ctx, List.of(operation));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(14000L, jdbc.queryForObject("select unit_price_pesos from sale_items where sale_id = "
        + "(select id from sales where tenant_id = ?)", Long.class, ctx.tenantId()));
    assertEquals(16500L, jdbc.queryForObject(
        "select catalog_unit_price_pesos from sale_items where sale_id = "
            + "(select id from sales where tenant_id = ?)", Long.class, ctx.tenantId()));
  }

  @Test void legacySaleWithoutOverrideFieldsStillApplies() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(saleOperation(ctx, "op-legacy", 1, 16500, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(16500L, jdbc.queryForObject(
        "select catalog_unit_price_pesos from sale_items where sale_id = "
            + "(select id from sales where tenant_id = ?)", Long.class, ctx.tenantId()));
  }

  @Test void addonsWithQuantityChangeTheTotalAndAreFrozen() throws Exception {
    var ctx = fixture();
    var addonId = addon(ctx, "TOCINETA", 5000);

    var result = push(ctx, List.of(
        saleOperationWithAddons(ctx, "op-addons", 1, 16500, addonId, 2, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(26500L, jdbc.queryForObject(
        "select total_pesos from sales where tenant_id = ?", Long.class, ctx.tenantId()));
    assertEquals(2, jdbc.queryForObject(
        "select quantity from sale_item_addons where tenant_id = ?", Integer.class, ctx.tenantId()));
  }

  @Test void splitPaymentsThroughSyncAreApplied() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(splitSaleOperation(ctx, "op-split", 1, 20000, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(2, jdbc.queryForObject("select count(*) from payments where sale_id = "
        + "(select id from sales where tenant_id = ?)", Integer.class, ctx.tenantId()));
  }

  @Test void paymentMismatchIsRejectedAndBatchContinues() throws Exception {
    var ctx = fixture();
    var bad = push(ctx, List.of(splitSaleOperation(ctx, "op-bad-pay", 1, 20000, 12000, 7000,
        Instant.now())));

    assertEquals("REJECTED", syncStatus(bad.get(0)));
    assertEquals(0, countSales(ctx));
    assertEquals(1, jdbc.queryForObject("select count(*) from sync_operations "
            + "where operation_id = ? and applied_at is null", Integer.class,
        UUID.nameUUIDFromBytes("op-bad-pay".getBytes(StandardCharsets.UTF_8))));

    var good = push(ctx, List.of(splitSaleOperation(ctx, "op-good-after", 2, 20000,
        Instant.now())));
    assertEquals("APPLIED", syncStatus(good.get(0)));
    assertEquals(1, countSales(ctx));
  }

  @Test void cashExpenseCreatesMovementAndExpense() throws Exception {
    var ctx = fixture();
    category(ctx, "Fruver");
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-expense", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(45000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(1, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
        + "and voided_at is null", Integer.class, ctx.tenantId()));
    var expense = jdbc.queryForMap("select category, amount_pesos, cash_movement_id from expenses "
        + "where tenant_id = ?", ctx.tenantId());
    assertEquals("Fruver", expense.get("category"));
    assertEquals(5000L, ((Number) expense.get("amount_pesos")).longValue());
    assertTrue(expense.get("cash_movement_id") != null);
  }

  @Test void cashMovementWithoutExpenseDoesNotCreateExpense() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-deposit", 1,
        "DEPOSIT", 10000, "fondo adicional", null, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(60000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void cashMovementRequiresReason() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-short", 1,
        "WITHDRAWAL", 5000, "abcd", null, Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
    assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void cashMovementRequiresOpenShift() throws Exception {
    var ctx = fixture();
    jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-closed", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
  }

  @Test void legacyCashMovementWithoutExpenseStillApplies() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-legacy-cash", 1,
        "DEPOSIT", 5000, "cambio", null, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(55000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void cashExpenseCategoryMustBeValid() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(cashMovementOperation(ctx, "op-long-category", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "x".repeat(101), Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
    assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void correctionVoidsOldAndCreatesNew() throws Exception {
    var ctx = fixture();
    category(ctx, "Fruver");
    category(ctx, "Aseo");
    var first = push(ctx, List.of(cashMovementOperation(ctx, "op-m1", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
    var oldId = UUID.fromString((String) result(first.get(0), "movementId"));

    var second = push(ctx, List.of(correctionOperation(ctx, "op-m2", 2, oldId,
        "WITHDRAWAL", 3000, "compra lechuga", "Aseo", false, Instant.now())));

    assertEquals("APPLIED", syncStatus(second.get(0)));
    assertEquals(47000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(1, jdbc.queryForObject("select count(*) from cash_movements where id = ? "
        + "and voided_at is not null", Integer.class, oldId));
    assertEquals(1, jdbc.queryForObject("select count(*) from expenses where tenant_id = ? "
        + "and voided_at is null and category = 'Aseo'", Integer.class, ctx.tenantId()));
    assertEquals(1, jdbc.queryForObject("select count(*) from expenses where tenant_id = ? "
        + "and voided_at is not null and category = 'Fruver'", Integer.class, ctx.tenantId()));
  }

  @Test void voidRestoresExpectedCash() throws Exception {
    var ctx = fixture();
    category(ctx, "Fruver");
    var first = push(ctx, List.of(cashMovementOperation(ctx, "op-void-1", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
    var oldId = UUID.fromString((String) result(first.get(0), "movementId"));

    var second = push(ctx, List.of(correctionOperation(ctx, "op-void-2", 2, oldId,
        null, 0, null, null, true, Instant.now())));

    assertEquals("APPLIED", syncStatus(second.get(0)));
    assertEquals(50000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
        + "and voided_at is null", Integer.class, ctx.tenantId()));
    assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ? "
        + "and voided_at is null", Integer.class, ctx.tenantId()));
  }

  @Test void correctionWithoutOriginalStillCreatesNew() throws Exception {
    var ctx = fixture();
    var missing = UUID.randomUUID();
    var result = push(ctx, List.of(correctionOperation(ctx, "op-missing", 1, missing,
        "DEPOSIT", 2000, "reposicion", null, false, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(52000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
    assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where id = ?",
        Integer.class, missing));
  }

  @Test void correctionOnClosedShiftIsRejected() throws Exception {
    var ctx = fixture();
    category(ctx, "Fruver");
    var first = push(ctx, List.of(cashMovementOperation(ctx, "op-closed-1", 1,
        "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
    var oldId = UUID.fromString((String) result(first.get(0), "movementId"));
    jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());

    var second = push(ctx, List.of(correctionOperation(ctx, "op-closed-2", 2, oldId,
        "WITHDRAWAL", 3000, "compra lechuga", "Aseo", false, Instant.now())));

    assertEquals("REJECTED", syncStatus(second.get(0)));
    assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
        + "and voided_at is not null", Integer.class, ctx.tenantId()));
  }

  @Test void closeStoresBreakdownAndNote() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(closeOperation(ctx, "op-close", 1, 43000, 43000,
        Map.of(20000, 2, 1000, 3), "faltante revisado", Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals("2", jdbc.queryForObject("select counted_breakdown->>'20000' from shifts "
        + "where id = ?", String.class, ctx.shiftId()));
    assertEquals("faltante revisado", jdbc.queryForObject("select close_note from shifts "
        + "where id = ?", String.class, ctx.shiftId()));
  }

  @Test void breakdownMustMatchCounted() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(closeOperation(ctx, "op-close-bad-sum", 1, 42000, 42000,
        Map.of(20000, 2, 1000, 3), "faltante", Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
    assertEquals(0, jdbc.queryForObject("select count(*) from shifts where id = ? "
        + "and closed_at is not null", Integer.class, ctx.shiftId()));
  }

  @Test void invalidDenominationIsRejected() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(closeOperation(ctx, "op-close-bad-den", 1, 1234, 1234,
        Map.of(1234, 1), null, Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
  }

  @Test void shortCloseNoteIsRejected() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(closeOperation(ctx, "op-close-short-note", 1, 49000, 49000,
        null, "abc", Instant.now())));

    assertEquals("REJECTED", syncStatus(result.get(0)));
  }

  @Test void legacyCloseWithoutBreakdownStillApplies() throws Exception {
    var ctx = fixture();
    var result = push(ctx, List.of(closeOperation(ctx, "op-close-legacy", 1, 50000, 50000,
        null, null, Instant.now())));

    assertEquals("APPLIED", syncStatus(result.get(0)));
    assertEquals(50000L, jdbc.queryForObject("select counted_cash_pesos from shifts where id = ?",
        Long.class, ctx.shiftId()));
  }

  @Test void serverExpectedDivergenceIsStored() throws Exception {
    var ctx = fixture();
    push(ctx, List.of(closeOperation(ctx, "op-close-diff", 1, 49000, 49000, null, null,
        Instant.now())));
    var row = jdbc.queryForMap("select expected_local_pesos, expected_server_pesos, "
        + "difference_pesos from shifts where id = ?", ctx.shiftId());
    assertEquals(49000L, ((Number) row.get("expected_local_pesos")).longValue());
    assertEquals(50000L, ((Number) row.get("expected_server_pesos")).longValue());
    assertEquals(-1000L, ((Number) row.get("difference_pesos")).longValue());
  }

  @Test void refundWithShortReasonIsRejectedThroughSync() throws Exception {
    var ctx = fixture();
    var sale = push(ctx, List.of(saleOperation(ctx, "op-refund-sale", 1, 16500, Instant.now())));
    assertEquals("APPLIED", syncStatus(sale.get(0)));
    var saleId = UUID.fromString((String) result(sale.get(0), "id"));

    var bad = push(ctx, List.of(refundOperation(ctx, "op-bad-refund", 2, saleId, "abcd",
        Instant.now())));
    assertEquals("REJECTED", syncStatus(bad.get(0)));
    assertEquals(0, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
        Integer.class, ctx.tenantId()));

    var good = push(ctx, List.of(refundOperation(ctx, "op-good-refund", 3, saleId,
        "cobro equivocado", Instant.now())));
    assertEquals("APPLIED", syncStatus(good.get(0)));
    assertEquals(1, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void twoHundredRetriesDoNotDuplicateTheSale() throws Exception {
    var ctx = fixture();
    var operation = saleOperation(ctx, "op-200", 1, 16500, Instant.now());

    for (int i = 0; i < 200; i++) {
      push(ctx, List.of(operation));
    }

    assertEquals(1, countSales(ctx));
  }

  @Test void withoutDeviceTokenTheSyncIsRejected() throws Exception {
    mvc.perform(post("/api/sync/operations").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("operations", List.of()))))
        .andExpect(status().isUnauthorized());
  }

  private record Ctx(UUID tenantId, UUID locationId, UUID userId, UUID deviceId, UUID shiftId,
                     UUID productId, String deviceToken) {
  }

  private Ctx fixture() {
    var tenantId = UUID.randomUUID();
    var locationId = UUID.randomUUID();
    var userId = UUID.randomUUID();
    var deviceId = UUID.randomUUID();
    var productId = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", tenantId, "Karbon");
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, 'ALM', 'Almendros')",
        locationId, tenantId);
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, 'cajero', 'hash', 'CASHIER')", userId, tenantId, locationId);
    var deviceToken = "token-" + tenantId;
    jdbc.update("insert into devices(id, tenant_id, location_id, code, name, token_hash, status) "
        + "values (?, ?, ?, 'A', 'Caja A', ?, 'ACTIVE')", deviceId, tenantId, locationId,
        sha256(deviceToken));
    jdbc.update("insert into products(id, tenant_id, location_id, kind, name, price_pesos) "
        + "values (?, ?, ?, 'PRODUCT', 'SENCILLA', 16500)", productId, tenantId, locationId);
    var shiftId = UUID.randomUUID();
    jdbc.update("insert into shifts(id, tenant_id, location_id, device_id, user_id, "
        + "opening_cash_pesos, operational_date) values (?, ?, ?, ?, ?, 50000, current_date)",
        shiftId, tenantId, locationId, deviceId, userId);
    return new Ctx(tenantId, locationId, userId, deviceId, shiftId, productId, deviceToken);
  }

  private SyncOperation saleOperation(Ctx ctx, String operationId, long seq, long unitPrice,
                                      Instant clientCreatedAt) {
    return saleOperation(ctx, operationId, seq, unitPrice, unitPrice, null, clientCreatedAt);
  }

  private SyncOperation saleOperation(Ctx ctx, String operationId, long seq, long unitPrice,
                                      long catalogPrice, String overrideReason,
                                      Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var saleId = UUID.randomUUID();
    var item = new java.util.HashMap<String, Object>();
    item.put("productId", ctx.productId().toString());
    item.put("productName", "SENCILLA");
    item.put("categoryName", "HAMBURGUESAS");
    item.put("quantity", 1);
    item.put("unitPricePesos", unitPrice);
    item.put("modifiers", List.of());
    item.put("components", List.of());
    if (overrideReason != null) {
      item.put("catalogUnitPricePesos", catalogPrice);
      item.put("overrideReason", overrideReason);
    }
    return new SyncOperation(id, seq, "CREATE_SALE", saleId, ctx.userId(), clientCreatedAt,
        Map.of(
            "type", "COUNTER",
            "shiftId", ctx.shiftId().toString(),
            "method", "CASH",
            "deliveryFeePesos", 0,
            "displayCode", "ALM-A-" + String.format("%06d", seq),
            "deviceSeq", seq,
            "items", List.of(item)));
  }

  private UUID addon(Ctx ctx, String name, long pricePesos) {
    var id = UUID.randomUUID();
    jdbc.update("insert into addons(id, tenant_id, location_id, name, price_pesos) "
        + "values (?, ?, ?, ?, ?)", id, ctx.tenantId(), ctx.locationId(), name, pricePesos);
    return id;
  }

  private SyncOperation saleOperationWithAddons(Ctx ctx, String operationId, long seq,
                                                long unitPrice, UUID addonId,
                                                int addonQuantity, Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var saleId = UUID.randomUUID();
    var item = new java.util.HashMap<String, Object>();
    item.put("productId", ctx.productId().toString());
    item.put("productName", "SENCILLA");
    item.put("categoryName", "HAMBURGUESAS");
    item.put("quantity", 1);
    item.put("unitPricePesos", unitPrice);
    item.put("modifiers", List.of());
    item.put("addons", List.of(Map.of(
        "addonId", addonId.toString(),
        "addonName", "TOCINETA",
        "additionalPricePesos", 5000,
        "quantity", addonQuantity)));
    item.put("components", List.of());
    return new SyncOperation(id, seq, "CREATE_SALE", saleId, ctx.userId(), clientCreatedAt,
        Map.of(
            "type", "COUNTER",
            "shiftId", ctx.shiftId().toString(),
            "method", "CASH",
            "deliveryFeePesos", 0,
            "displayCode", "ALM-A-" + String.format("%06d", seq),
            "deviceSeq", seq,
            "items", List.of(item)));
  }

  private SyncOperation splitSaleOperation(Ctx ctx, String operationId, long seq, long unitPrice,
                                           Instant clientCreatedAt) {
    return splitSaleOperation(ctx, operationId, seq, unitPrice, 12000, 8000, clientCreatedAt);
  }

  private SyncOperation splitSaleOperation(Ctx ctx, String operationId, long seq, long unitPrice,
                                           long cashPesos, long cardPesos,
                                           Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var saleId = UUID.randomUUID();
    var item = new java.util.HashMap<String, Object>();
    item.put("productId", ctx.productId().toString());
    item.put("productName", "SENCILLA");
    item.put("categoryName", "HAMBURGUESAS");
    item.put("quantity", 1);
    item.put("unitPricePesos", unitPrice);
    item.put("modifiers", List.of());
    item.put("components", List.of());
    return new SyncOperation(id, seq, "CREATE_SALE", saleId, ctx.userId(), clientCreatedAt,
        Map.of(
            "type", "COUNTER",
            "shiftId", ctx.shiftId().toString(),
            "deliveryFeePesos", 0,
            "displayCode", "ALM-A-" + String.format("%06d", seq),
            "deviceSeq", seq,
            "items", List.of(item),
            "payments", List.of(
                Map.of("method", "CASH", "amountPesos", cashPesos),
                Map.of("method", "CARD", "amountPesos", cardPesos))));
  }

  private String syncStatus(Map<String, Object> result) {
    return (String) result.get("status");
  }

  private Object result(Map<String, Object> result, String field) {
    return ((Map<?, ?>) result.get("result")).get(field);
  }

  private SyncOperation refundOperation(Ctx ctx, String operationId, long seq, UUID saleId,
                                        String reason, Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    return new SyncOperation(id, seq, "REFUND_SALE", saleId, ctx.userId(), clientCreatedAt,
        Map.of("shiftId", ctx.shiftId().toString(), "saleId", saleId.toString(),
            "method", "CASH", "reason", reason));
  }

  private UUID category(Ctx ctx, String name) {
    var id = UUID.randomUUID();
    jdbc.update("insert into expense_categories(id, tenant_id, location_id, name, sort_order) "
        + "values (?, ?, ?, ?, 0)", id, ctx.tenantId(), ctx.locationId(), name);
    return id;
  }

  private SyncOperation cashMovementOperation(Ctx ctx, String operationId, long seq, String type,
                                              long amountPesos, String reason,
                                              String expenseCategoryName,
                                              Instant clientCreatedAt) {
    return cashMovementOperation(ctx, operationId, seq, type, amountPesos, reason,
        expenseCategoryName, null, false, clientCreatedAt);
  }

  private SyncOperation cashMovementOperation(Ctx ctx, String operationId, long seq, String type,
                                              long amountPesos, String reason,
                                              String expenseCategoryName,
                                              UUID replacesMovementId, boolean voided,
                                              Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var movementId = UUID.randomUUID();
    var payload = new java.util.HashMap<String, Object>();
    payload.put("shiftId", ctx.shiftId().toString());
    payload.put("movementType", type);
    payload.put("amountPesos", amountPesos);
    payload.put("reason", reason);
    if (expenseCategoryName != null) {
      payload.put("expenseCategoryName", expenseCategoryName);
    }
    if (replacesMovementId != null) {
      payload.put("replacesMovementId", replacesMovementId.toString());
    }
    if (voided) {
      payload.put("voided", true);
    }
    return new SyncOperation(id, seq, "CASH_MOVEMENT", movementId, ctx.userId(), clientCreatedAt,
        payload);
  }

  private SyncOperation correctionOperation(Ctx ctx, String operationId, long seq,
                                            UUID replacesMovementId, String type,
                                            long amountPesos, String reason,
                                            String expenseCategoryName, boolean voided,
                                            Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var movementId = UUID.randomUUID();
    var payload = new java.util.HashMap<String, Object>();
    payload.put("shiftId", ctx.shiftId().toString());
    payload.put("replacesMovementId", replacesMovementId.toString());
    if (voided) {
      payload.put("voided", true);
    } else {
      payload.put("movementType", type);
      payload.put("amountPesos", amountPesos);
      payload.put("reason", reason);
      if (expenseCategoryName != null) {
        payload.put("expenseCategoryName", expenseCategoryName);
      }
    }
    return new SyncOperation(id, seq, "CASH_MOVEMENT", movementId, ctx.userId(), clientCreatedAt,
        payload);
  }

  private SyncOperation closeOperation(Ctx ctx, String operationId, long seq, long counted,
                                       long expectedLocal, Map<Integer, Integer> breakdown,
                                       String note, Instant clientCreatedAt) {
    var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
    var payload = new java.util.HashMap<String, Object>();
    payload.put("shiftId", ctx.shiftId().toString());
    payload.put("countedCashPesos", counted);
    payload.put("expectedPesos", expectedLocal);
    if (breakdown != null) {
      payload.put("countedBreakdown", breakdown);
    }
    if (note != null) {
      payload.put("closeNote", note);
    }
    return new SyncOperation(id, seq, "CLOSE_SHIFT", ctx.shiftId(), ctx.userId(),
        clientCreatedAt, payload);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> push(Ctx ctx, List<SyncOperation> operations) throws Exception {
    var body = mvc.perform(post("/api/sync/operations")
            .header("X-Device-Token", ctx.deviceToken())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("operations", operations))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    var response = json.readValue(body, Map.class);
    return (List<Map<String, Object>>) response.get("operations");
  }

  private int countSales(Ctx ctx) {
    return jdbc.queryForObject("select count(*) from sales where tenant_id = ?", Integer.class,
        ctx.tenantId());
  }

  private String sha256(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
