package com.caja.synchronization;

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
