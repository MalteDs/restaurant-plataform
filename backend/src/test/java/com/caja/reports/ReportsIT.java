package com.caja.reports;

import com.caja.shifts.RefundCommand;
import com.caja.shifts.ShiftApplicationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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

  @Test void sumsTheoreticalConsumptionWithoutDoubleCountingCombos() throws Exception {
    var ctx = fixture();
    var carne = ingredient(ctx, "CARNE", "UNIT", 0);
    var tocineta = ingredient(ctx, "TOCINETA", "GRAM", 10);
    var addonId = addon(ctx, "TOCINETA EXTRA", tocineta, 30);
    recipe(ctx, ctx.productId(), carne, 1);
    var comboId = combo(ctx, "COMBO CONSUMO", ctx.productId(), 2);

    saleWithComponent(ctx, comboId, 2, addonId, 2);

    var summary = summary(ctx);
    var rows = (List<Map<String, Object>>) summary.get("byIngredient");
    assertEquals(4.0, ((Number) row(rows, "CARNE").get("quantity")).doubleValue());
    assertEquals(132.0, ((Number) row(rows, "TOCINETA").get("quantity")).doubleValue());
  }

  @Test void summaryExcludesRefundedSalesFromConsumption() throws Exception {
    var ctx = fixture();
    var carne = ingredient(ctx, "CARNE", "UNIT", 0);
    recipe(ctx, ctx.productId(), carne, 1);
    saleWithStatus(ctx, ctx.productId(), 3, "REFUNDED");

    var rows = (List<Map<String, Object>>) summary(ctx).get("byIngredient");
    assertTrue(rows.isEmpty());
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

  @Test void expenseRequiresAnActiveCategory() throws Exception {
    var ctx = fixture();
    var categoryId = createCategory(ctx, "Domicilios", "admin_categorias");

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "gerente_categorias", "MANAGER"))
            .content(json.writeValueAsString(Map.of("expenseCategoryId", categoryId,
                "description", "Domicilio", "amountPesos", 10000))))
        .andExpect(status().isCreated());

    mvc.perform(put("/api/expenses/categories/" + categoryId)
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "admin_categorias", "ADMIN"))
            .content(json.writeValueAsString(Map.of("active", false))))
        .andExpect(status().isNoContent());

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "gerente_categorias", "MANAGER"))
            .content(json.writeValueAsString(Map.of("expenseCategoryId", categoryId,
                "description", "Otro", "amountPesos", 5000))))
        .andExpect(status().isBadRequest());
  }

  @Test void cashierCannotReadSummary() throws Exception {
    var ctx = fixture();

    mvc.perform(get("/api/reports/summary")
            .header("Authorization", "Bearer " + token(ctx, "cajero_resumen", "CASHIER")))
        .andExpect(status().isForbidden());
  }

  @Test void cashierCanReadExpenseCategories() throws Exception {
    var ctx = fixture();
    createCategory(ctx, "Fruver", "admin_categorias");

    mvc.perform(get("/api/expenses/categories")
            .header("Authorization", "Bearer " + token(ctx, "cajero_categorias", "CASHIER")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].name").exists());
  }

  @Test void legacyCategoryTextStillWorks() throws Exception {
    var ctx = fixture();

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "gerente_legacy", "MANAGER"))
            .content(json.writeValueAsString(Map.of("category", "Transporte",
                "description", "Taxi", "amountPesos", 1000))))
        .andExpect(status().isCreated());
  }

  @SuppressWarnings("unchecked")
  @Test void summaryGroupsExpensesByFrozenCategoryName() throws Exception {
    var ctx = fixture();
    var categoryId = createCategory(ctx, "Fruver", "admin_categorias");

    mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "gerente_fruver", "MANAGER"))
            .content(json.writeValueAsString(Map.of("expenseCategoryId", categoryId,
                "description", "Lechuga", "amountPesos", 5000))))
        .andExpect(status().isCreated());
    expense(ctx, 10000);

    mvc.perform(put("/api/expenses/categories/" + categoryId)
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, "admin_categorias", "ADMIN"))
            .content(json.writeValueAsString(Map.of("name", "Mercado"))))
        .andExpect(status().isNoContent());

    var grouped = (java.util.List<Map<String, Object>>) summary(ctx).get("byExpenseCategory");
    assertEquals(5000, ((Number) grouped.stream()
        .filter(row -> "Fruver".equals(row.get("name"))).findFirst().orElseThrow()
        .get("amountPesos")).longValue());
    assertEquals(10000, ((Number) grouped.stream()
        .filter(row -> "Transporte".equals(row.get("name"))).findFirst().orElseThrow()
        .get("amountPesos")).longValue());
    assertTrue(grouped.stream().noneMatch(row -> "Mercado".equals(row.get("name"))));
  }

  @Test void summaryExcludesVoidedExpenses() throws Exception {
    var ctx = fixture();
    expense(ctx, 10000);
    var voidedId = UUID.randomUUID();
    jdbc.update("insert into expenses(id, tenant_id, location_id, user_id, category, description, "
        + "amount_pesos, expense_date, voided_at, voided_by) values (?, ?, ?, ?, 'Aseo', 'Jabon', "
        + "5000, current_date, now(), ?)", voidedId, ctx.tenantId(), ctx.locationId(), ctx.userId(),
        ctx.userId());

    assertEquals(10000, summary(ctx).get("expensesPesos"));
    assertTrue(((List<?>) summary(ctx).get("byExpenseCategory")).stream()
        .noneMatch(row -> "Aseo".equals(((Map<?, ?>) row).get("name"))));
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

  private UUID ingredient(Ctx ctx, String name, String unit, double wastePercent) {
    var id = UUID.randomUUID();
    jdbc.update("insert into ingredients(id, tenant_id, location_id, name, unit, waste_percent) "
        + "values (?, ?, ?, ?, ?::ingredient_unit, ?)", id, ctx.tenantId(), ctx.locationId(), name,
        unit, wastePercent);
    return id;
  }

  private void recipe(Ctx ctx, UUID productId, UUID ingredientId, double quantity) {
    jdbc.update("insert into recipe_items(id, tenant_id, location_id, product_id, ingredient_id, "
        + "quantity) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), ctx.tenantId(),
        ctx.locationId(), productId, ingredientId, quantity);
  }

  private UUID addon(Ctx ctx, String name, UUID ingredientId, double quantity) {
    var id = UUID.randomUUID();
    jdbc.update("insert into addons(id, tenant_id, location_id, name, price_pesos) "
        + "values (?, ?, ?, ?, 5000)", id, ctx.tenantId(), ctx.locationId(), name);
    jdbc.update("insert into recipe_items(id, tenant_id, location_id, addon_id, ingredient_id, "
        + "quantity) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), ctx.tenantId(),
        ctx.locationId(), id, ingredientId, quantity);
    return id;
  }

  private UUID combo(Ctx ctx, String name, UUID componentId, int quantity) {
    var id = UUID.randomUUID();
    jdbc.update("insert into products(id, tenant_id, location_id, kind, name, price_pesos) "
        + "values (?, ?, ?, 'COMBO', ?, 25000)", id, ctx.tenantId(), ctx.locationId(), name);
    jdbc.update("insert into combo_components(combo_product_id, component_product_id, quantity, "
        + "tenant_id, location_id) values (?, ?, ?, ?, ?)", id, componentId, quantity,
        ctx.tenantId(), ctx.locationId());
    return id;
  }

  private void saleWithComponent(Ctx ctx, UUID productId, int quantity, UUID addonId,
                                 int addonQuantity) {
    var saleId = UUID.randomUUID();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          total_pesos, display_code, device_seq, operational_date, client_created_at)
        values (?, ?, ?, ?, ?, ?, 'COUNTER', 50000, ?, ?, current_date, now())
        """, saleId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), ctx.shiftId(),
        "ALM-X-" + UUID.randomUUID().toString().substring(0, 6),
        Math.abs(UUID.randomUUID().getMostSignificantBits() % 100000));
    jdbc.update("insert into payments(id, tenant_id, location_id, sale_id, method, amount_pesos) "
        + "values (?, ?, ?, ?, 'CASH', 50000)", UUID.randomUUID(), ctx.tenantId(),
        ctx.locationId(), saleId);
    var itemId = UUID.randomUUID();
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, line_total_pesos)
        values (?, ?, ?, ?, ?, 'COMBO CONSUMO', 'COMBOS', ?, 25000, 50000)
        """, itemId, ctx.tenantId(), ctx.locationId(), saleId, productId, quantity);
    jdbc.update("insert into sale_item_components(sale_item_id, component_product_id, "
        + "component_name, quantity, tenant_id, location_id) values (?, ?, 'PRODUCTO', 2, ?, ?)",
        itemId, ctx.productId(), ctx.tenantId(), ctx.locationId());
    jdbc.update("insert into sale_item_addons(sale_item_id, addon_id, addon_name, "
        + "additional_price_pesos, quantity, tenant_id, location_id) values (?, ?, 'TOCINETA', "
        + "5000, ?, ?, ?)", itemId, addonId, addonQuantity, ctx.tenantId(), ctx.locationId());
  }

  private void saleWithStatus(Ctx ctx, UUID productId, int quantity, String status) {
    var saleId = UUID.randomUUID();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          total_pesos, status, display_code, device_seq, operational_date,
                          client_created_at)
        values (?, ?, ?, ?, ?, ?, 'COUNTER', 16500, ?::sale_status, ?, ?, current_date, now())
        """, saleId, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), ctx.shiftId(),
        status, "ALM-R-" + UUID.randomUUID().toString().substring(0, 6),
        Math.abs(UUID.randomUUID().getMostSignificantBits() % 100000));
    jdbc.update("insert into payments(id, tenant_id, location_id, sale_id, method, amount_pesos) "
        + "values (?, ?, ?, ?, 'CASH', 16500)", UUID.randomUUID(), ctx.tenantId(),
        ctx.locationId(), saleId);
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, line_total_pesos)
        values (?, ?, ?, ?, ?, 'PRODUCTO', 'HAMBURGUESAS', ?, 16500, 16500)
        """, UUID.randomUUID(), ctx.tenantId(), ctx.locationId(), saleId, productId, quantity);
  }

  private Map<String, Object> row(List<Map<String, Object>> rows, String name) {
    return rows.stream().filter(row -> name.equals(row.get("name"))).findFirst().orElseThrow();
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

  private UUID createCategory(Ctx ctx, String name, String adminUsername) throws Exception {
    var body = mvc.perform(post("/api/expenses/categories").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + token(ctx, adminUsername, "ADMIN"))
            .content(json.writeValueAsString(Map.of("name", name))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
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
