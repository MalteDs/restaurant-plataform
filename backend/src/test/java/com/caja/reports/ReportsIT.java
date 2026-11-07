package com.caja.reports;

import com.caja.shifts.RefundCommand;
import com.caja.shifts.ShiftApplicationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReportsIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;
  @Autowired PasswordEncoder passwordEncoder;
  @Autowired ShiftApplicationService shifts;

  @Test void summaryComputesNetSalesAndProfit() throws Exception {
    var ctx = fixture();
    sale(ctx, 16500, "CASH", "SENCILLA");
    sale(ctx, 18500, "CARD", "ESPECIAL AMERICANO");
    refund(ctx, 16500);
    expense(ctx, 10000);

    var summary = summary(ctx);

    assertEquals(35000, summary.get("salesPesos"));
    assertEquals(16500, summary.get("refundsPesos"));
    assertEquals(18500, summary.get("netSalesPesos"));
    assertEquals(16500, summary.get("cashPesos"));
    assertEquals(18500, summary.get("cardPesos"));
    assertEquals(8500, summary.get("operatingProfitPesos"));
    assertEquals(1, summary.get("refundCount"));
    assertEquals(2, summary.get("orders"));
    assertEquals(2, ((java.util.List<?>) summary.get("byProduct")).size());
  }

  @Test void summaryExcludesOtherTenant() throws Exception {
    var ctx = fixture();
    var other = fixture();
    sale(ctx, 16500, "CASH", "SENCILLA");
    sale(other, 50000, "CASH", "OTRO");

    var summary = summary(ctx);

    assertEquals(16500, summary.get("salesPesos"));
    assertEquals(1, summary.get("orders"));
  }

  @Test void expenseReducesOperatingProfitAndRejectsCashier() throws Exception {
    var ctx = fixture();
    sale(ctx, 18500, "CARD", "SENCILLA");

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "cajero_reporte", "CASHIER"))
            .content(json.writeValueAsString(Map.of("category", "Transporte", "description",
                "Taxi", "amountPesos", 10000))))
        .andExpect(status().isForbidden());

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "gerente_reporte", "MANAGER"))
            .content(json.writeValueAsString(Map.of("category", "Transporte", "description",
                "Taxi", "amountPesos", 10000))))
        .andExpect(status().isCreated());

    assertEquals(8500, summary(ctx).get("operatingProfitPesos"));
  }

  @Test void costCountsQuantityAndExcludesRefundedSales() throws Exception {
    var ctx = fixture();
    saleWithCost(ctx, 33000, 2, 5000, "CHARGED");
    saleWithCost(ctx, 9000, 1, 9000, "REFUNDED");

    assertEquals(10000, summary(ctx).get("costPesos"));
  }

  @Test void refundsAndExpensesAreAudited() throws Exception {
    var ctx = fixture();
    sale(ctx, 16500, "CASH", "SENCILLA");
    refund(ctx, 16500);

    var response = mvc.perform(get("/api/audit")
            .param("from", LocalDate.now().toString())
            .param("to", LocalDate.now().toString())
            .header("Authorization", "Bearer " + token(ctx, "admin_reporte", "ADMIN")))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    assertTrue(response.contains("REFUND"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> summary(Ctx ctx) throws Exception {
    var body = mvc.perform(get("/api/reports/summary")
            .param("from", LocalDate.now().toString())
            .param("to", LocalDate.now().toString())
            .header("Authorization", "Bearer " + token(ctx, "admin_reporte", "ADMIN")))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return json.readValue(body, Map.class);
  }

  private record Ctx(UUID tenantId, UUID locationId, UUID userId, UUID deviceId, UUID shiftId,
                     UUID productId) {
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
        + "values (?, ?, ?, 'cajero', 'hash', 'CASHIER')", userId, tenantId, locationId);
    jdbc.update("insert into devices(id, tenant_id, location_id, code, name, token_hash, status) "
        + "values (?, ?, ?, 'A', 'Caja A', 'hash', 'ACTIVE')", deviceId, tenantId, locationId);
    var shiftId = UUID.randomUUID();
    jdbc.update("insert into shifts(id, tenant_id, location_id, device_id, user_id, "
        + "opening_cash_pesos, operational_date) values (?, ?, ?, ?, ?, 50000, current_date)",
        shiftId, tenantId, locationId, deviceId, userId);
    var productId = UUID.randomUUID();
    jdbc.update("insert into products(id, tenant_id, location_id, kind, name, price_pesos) "
        + "values (?, ?, ?, 'PRODUCT', 'PRODUCTO', 16500)", productId, tenantId, locationId);
    return new Ctx(tenantId, locationId, userId, deviceId, shiftId, productId);
  }

  private void sale(Ctx ctx, long totalPesos, String method, String productName) {
    var saleId = UUID.randomUUID();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          total_pesos, display_code, device_seq, operational_date, client_created_at)
        values (?, ?, ?, ?, ?, ?, 'COUNTER', ?, ?, ?, current_date, now())
        """, saleId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), ctx.shiftId(),
        totalPesos, "ALM-A-" + UUID.randomUUID().toString().substring(0, 6),
        Math.abs(UUID.randomUUID().getMostSignificantBits() % 100000));
    jdbc.update("insert into payments(id, tenant_id, location_id, sale_id, method, amount_pesos) "
        + "values (?, ?, ?, ?, ?::payment_method, ?)", UUID.randomUUID(), ctx.tenantId(),
        ctx.locationId(), saleId, method, totalPesos);
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, cost_pesos,
                               line_total_pesos)
        values (?, ?, ?, ?, ?, ?, 'HAMBURGUESAS', 1, ?, 0, ?)
        """, UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), saleId, ctx.productId(),
        productName, totalPesos, totalPesos);
    jdbc.update("""
        insert into orders(id, tenant_id, location_id, sale_id, source, status, operational_date)
        values (?, ?, ?, ?, 'CAJA', 'CHARGED', current_date)
        """, UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), saleId);
  }

  private void saleWithCost(Ctx ctx, long totalPesos, int quantity, long unitCost, String status) {
    var saleId = UUID.randomUUID();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          total_pesos, status, display_code, device_seq, operational_date,
                          client_created_at)
        values (?, ?, ?, ?, ?, ?, 'COUNTER', ?, ?::sale_status, ?, ?, current_date, now())
        """, saleId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), ctx.shiftId(),
        totalPesos, status, "ALM-C-" + UUID.randomUUID().toString().substring(0, 6),
        Math.abs(UUID.randomUUID().getMostSignificantBits() % 100000));
    jdbc.update("insert into payments(id, tenant_id, location_id, sale_id, method, amount_pesos) "
        + "values (?, ?, ?, ?, 'CASH', ?)", UUID.randomUUID(), ctx.tenantId(), ctx.locationId(),
        saleId, totalPesos);
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, cost_pesos,
                               line_total_pesos)
        values (?, ?, ?, ?, ?, 'PRODUCTO', 'HAMBURGUESAS', ?, ?, ?, ?)
        """, UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), saleId, ctx.productId(), quantity,
        totalPesos / quantity, unitCost, totalPesos);
  }

  private void refund(Ctx ctx, long amountPesos) {
    var saleId = jdbc.queryForObject(
        "select id from sales where tenant_id = ? and total_pesos = ? order by created_at limit 1",
        UUID.class, ctx.tenantId(), amountPesos);
    shifts.applyRefund(new RefundCommand(ctx.tenantId(), ctx.locationId(), ctx.deviceId(),
        ctx.userId(), ctx.shiftId(), saleId, "CASH", "prueba", Instant.now()));
  }

  private void expense(Ctx ctx, long amountPesos) {
    jdbc.update("""
        insert into expenses(id, tenant_id, location_id, user_id, category, description,
                             amount_pesos, expense_date)
        values (?, ?, ?, ?, 'Transporte', 'Taxi', ?, current_date)
        """, UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), ctx.userId(), amountPesos);
  }

  private String token(Ctx ctx, String username, String role) throws Exception {
    var unique = username + "-" + ctx.tenantId().toString().substring(0, 8);
    var userId = UUID.nameUUIDFromBytes(unique.getBytes());
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, ?, ?, ?::user_role) on conflict (id) do nothing", userId,
        ctx.tenantId(), ctx.locationId(), unique, passwordEncoder.encode("secreto"), role);
    var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", unique, "password", "secreto",
                "locationCode", "ALM"))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return (String) json.readValue(response, Map.class).get("accessToken");
  }
}
