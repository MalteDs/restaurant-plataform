package com.caja.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CatalogIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PasswordEncoder passwordEncoder;
  @Autowired ObjectMapper json;

  @Test void snapshotHasTheKarbonMenuWithExactPrices() throws Exception {
    var snapshot = snapshot();

    assertEquals(9, categories(snapshot).size());
    assertEquals(16500, price(snapshot, "SENCILLA"));
    assertEquals(68000, price(snapshot, "COMBO FAMILIAR"));
    assertEquals(7000, price(snapshot, "PAPAS AMARILLA"));
    assertEquals(33000, price(snapshot, "SALCHI LLANERA MEDIANA 2P"));
    assertEquals(4500, price(snapshot, "AGUA"));
    assertTrue(((Number) snapshot.get("version")).longValue() >= 1);
  }

  @Test void snapshotIncludesComboComponentsAndModifiers() throws Exception {
    var snapshot = snapshot();

    var familiar = product(snapshot, "COMBO FAMILIAR");
    var components = (List<Map<String, Object>>) familiar.get("components");
    assertEquals(3, components.size());

    var groups = (List<Map<String, Object>>) snapshot.get("modifierGroups");
    assertEquals(3, groups.size());
  }

  @Test void createsProductWithAddonsDayPricesAndRecipe() throws Exception {
    var ingredientId = ingredient("CARNE COMPLETA", "UNIT", 0);
    var addonId = addon("TOCINETA COMPLETA", 5000, ingredientId, 30);

    var request = Map.of(
        "name", "HAMBURGUESA COMPLETA",
        "pricePesos", 20000,
        "saleDays", List.of(1, 2, 3, 4),
        "addonIds", List.of(addonId),
        "dayPrices", List.of(Map.of("weekday", 1, "pricePesos", 18000)),
        "recipe", List.of(Map.of("ingredientId", ingredientId, "quantity", 120)));
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_producto_completo"))
            .content(json.writeValueAsString(request)))
        .andExpect(status().isCreated());

    var product = product(snapshot(), "HAMBURGUESA COMPLETA");
    assertEquals(List.of(1, 2, 3, 4), product.get("saleDays"));
    assertEquals(List.of(addonId.toString()), product.get("addonIds"));
    assertEquals(18000, ((Number) ((List<Map<String, Object>>) product.get("dayPrices"))
        .get(0).get("pricePesos")).longValue());
    assertEquals(120.0, ((Number) ((List<Map<String, Object>>) product.get("recipe"))
        .get(0).get("quantity")).doubleValue());
  }

  @Test void createsComboWithComponentsAndRejectsBadCompositions() throws Exception {
    var sencilla = productId("SENCILLA");
    var papas = productId("PAPAS A LA FRANCESA");
    var combo = Map.of(
        "name", "COMBO PRUEBA",
        "pricePesos", 25000,
        "kind", "COMBO",
        "components", List.of(
            Map.of("productId", sencilla, "quantity", 2),
            Map.of("productId", papas, "quantity", 1)));
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_combo"))
            .content(json.writeValueAsString(combo)))
        .andExpect(status().isCreated());
    assertEquals(2, ((List<?>) product(snapshot(), "COMBO PRUEBA").get("components")).size());

    var emptyCombo = Map.of(
        "name", "COMBO VACIO", "pricePesos", 1000, "kind", "COMBO", "components", List.of());
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_combo_malo"))
            .content(json.writeValueAsString(emptyCombo)))
        .andExpect(status().isBadRequest());

    var missingComponents = Map.of(
        "name", "COMBO SIN COMPONENTES", "pricePesos", 1000, "kind", "COMBO");
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_combo_sin"))
            .content(json.writeValueAsString(missingComponents)))
        .andExpect(status().isBadRequest());
  }

  @Test void rejectsNegativePriceAndBlankName() throws Exception {
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_catalogo"))
            .content(json.writeValueAsString(Map.of("name", "Producto", "pricePesos", -1))))
        .andExpect(status().isBadRequest());

    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_catalogo"))
            .content(json.writeValueAsString(Map.of("name", "  ", "pricePesos", 1000))))
        .andExpect(status().isBadRequest());
  }

  @Test void onlyAdminChangesTheCatalog() throws Exception {
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + tokenFor("cajero_catalogo", "CASHIER"))
            .content(json.writeValueAsString(Map.of("name", "Producto", "pricePesos", 1000))))
        .andExpect(status().isForbidden());
  }

  @Test void adminCreatesProductAndBumpsTheVersion() throws Exception {
    var before = ((Number) snapshot().get("version")).longValue();

    var response = mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_catalogo"))
            .content(json.writeValueAsString(Map.of("name", "Producto de prueba", "pricePesos",
                12300))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNotEmpty())
        .andReturn().getResponse().getContentAsString();

    assertNotNull(json.readValue(response, Map.class).get("id"));
    var after = ((Number) snapshot().get("version")).longValue();
    assertEquals(before + 1, after);
    assertEquals(12300, price(snapshot(), "Producto de prueba"));
  }

  @Test void saleDaysRoundTripAndRejectInvalidDays() throws Exception {
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_dias"))
            .content(json.writeValueAsString(Map.of("name", "COMBO PROMO", "pricePesos", 22500,
                "saleDays", List.of(1, 2, 3, 4)))))
        .andExpect(status().isCreated());

    assertEquals(List.of(1, 2, 3, 4), product(snapshot(), "COMBO PROMO").get("saleDays"));

    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_dias"))
            .content(json.writeValueAsString(Map.of("name", "COMBO MALO", "pricePesos", 1000,
                "saleDays", List.of(0, 8)))))
        .andExpect(status().isBadRequest());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> snapshot() throws Exception {
    var body = mvc.perform(get("/api/catalog")
            .header("Authorization", "Bearer " + adminToken("admin_catalogo")))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return json.readValue(body, Map.class);
  }

  private List<Map<String, Object>> categories(Map<String, Object> snapshot) {
    return (List<Map<String, Object>>) snapshot.get("categories");
  }

  private UUID ingredient(String name, String unit, double wastePercent) throws Exception {
    var body = mvc.perform(post("/api/catalog/ingredients").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_ingrediente"))
            .content(json.writeValueAsString(Map.of(
                "name", name, "unit", unit, "wastePercent", wastePercent))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private UUID addon(String name, long pricePesos, UUID ingredientId, double quantity)
      throws Exception {
    var body = mvc.perform(post("/api/catalog/addons").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_adicional"))
            .content(json.writeValueAsString(Map.of(
                "name", name,
                "pricePesos", pricePesos,
                "recipe", List.of(Map.of("ingredientId", ingredientId, "quantity", quantity))))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private UUID productId(String name) throws Exception {
    return UUID.fromString(String.valueOf(product(snapshot(), name).get("id")));
  }

  private Map<String, Object> product(Map<String, Object> snapshot, String name) {
    return products(snapshot).stream()
        .filter(p -> name.equals(p.get("name")))
        .findFirst()
        .orElseThrow(() -> new AssertionError("Producto no encontrado: " + name));
  }

  private List<Map<String, Object>> products(Map<String, Object> snapshot) {
    return (List<Map<String, Object>>) snapshot.get("products");
  }

  private long price(Map<String, Object> snapshot, String name) {
    return ((Number) product(snapshot, name).get("pricePesos")).longValue();
  }

  private String adminToken(String username) throws Exception {
    return tokenFor(username, "ADMIN");
  }

  private String tokenFor(String username, String role) throws Exception {    var tenantId = jdbc.queryForObject("select tenant_id from locations where code = 'ALM'",
        UUID.class);
    var locationId = jdbc.queryForObject("select id from locations where code = 'ALM'", UUID.class);
    var userId = UUID.nameUUIDFromBytes(username.getBytes());
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, ?, ?, ?::user_role) on conflict (id) do nothing", userId,
        tenantId, locationId, username, passwordEncoder.encode("secreto"), role);
    var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", username, "password", "secreto",
                "locationCode", "ALM"))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return (String) json.readValue(response, Map.class).get("accessToken");
  }
}
