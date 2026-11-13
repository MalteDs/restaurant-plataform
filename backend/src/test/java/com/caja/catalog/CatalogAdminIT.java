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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CatalogAdminIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PasswordEncoder passwordEncoder;
  @Autowired ObjectMapper json;

  @Test void adminSnapshotIncludesInactiveProductsAndCategories() throws Exception {
    var productId = createProduct("PRODUCTO INACTIVO", 10000);
    deactivateProduct(productId);
    var categoryId = createCategory("CATEGORIA INACTIVA");
    deactivateCategory(categoryId);

    assertTrue(adminProductNames().contains("PRODUCTO INACTIVO"));
    assertFalse(publicProductNames().contains("PRODUCTO INACTIVO"));
    assertTrue(adminCategoryNames().contains("CATEGORIA INACTIVA"));
    assertFalse(publicCategoryNames().contains("CATEGORIA INACTIVA"));
  }

  @Test void cashierCannotReadAdminSnapshot() throws Exception {
    mvc.perform(get("/api/catalog/admin")
            .header("Authorization", "Bearer " + tokenFor("cajero_admin_catalogo", "CASHIER")))
        .andExpect(status().isForbidden());
  }

  @Test void adminSnapshotIncludesInactiveModifierGroups() throws Exception {
    var groupId = createModifierGroup("GRUPO INACTIVO");
    deactivateModifierGroup(groupId);

    assertTrue(adminGroupNames().contains("GRUPO INACTIVO"));
    assertFalse(publicGroupNames().contains("GRUPO INACTIVO"));
  }

  @Test void createsAddonWithRecipeAndIngredient() throws Exception {
    var ingredientId = createIngredient("TOCINETA RECETA", "GRAM", 5);
    createAddon("TOCINETA EXTRA", 5000, ingredientId, 30);

    var snapshot = snapshot("/api/catalog/admin");
    var addon = ((List<Map<String, Object>>) snapshot.get("addons")).stream()
        .filter(row -> "TOCINETA EXTRA".equals(row.get("name"))).findFirst().orElseThrow();
    assertEquals(5000, ((Number) addon.get("pricePesos")).longValue());
    var recipe = (List<Map<String, Object>>) addon.get("recipe");
    assertEquals(30.0, ((Number) recipe.get(0).get("quantity")).doubleValue());

    var ingredient = ((List<Map<String, Object>>) snapshot.get("ingredients")).stream()
        .filter(row -> "TOCINETA RECETA".equals(row.get("name"))).findFirst().orElseThrow();
    assertEquals("GRAM", ingredient.get("unit"));
    assertEquals(5.0, ((Number) ingredient.get("wastePercent")).doubleValue());
  }

  @Test void inactiveAddonLeavesThePublicSnapshot() throws Exception {
    var ingredientId = createIngredient("QUESO RECETA", "UNIT", 0);
    var addonId = createAddon("QUESO EXTRA INACTIVO", 3000, ingredientId, 1);
    updateAddon(addonId, false);

    assertFalse(names(snapshot("/api/catalog"), "addons").contains("QUESO EXTRA INACTIVO"));
    assertTrue(names(snapshot("/api/catalog/admin"), "addons").contains("QUESO EXTRA INACTIVO"));
  }

  @Test void reactivatesProductForSaleSnapshot() throws Exception {
    var productId = createProduct("PRODUCTO REACTIVABLE", 10000);
    updateProductActive(productId, false);
    assertFalse(publicProductNames().contains("PRODUCTO REACTIVABLE"));

    updateProductActive(productId, true);
    assertTrue(publicProductNames().contains("PRODUCTO REACTIVABLE"));
  }

  @Test void assignsAndClearsModifierGroupsOnProduct() throws Exception {
    var groupId = createModifierGroup("GRUPO ASIGNABLE");
    var productId = createProductWithGroups("PRODUCTO CON GRUPO", List.of(groupId));

    assertEquals(List.of(groupId), adminProductGroupIds(productId));

    updateProductGroups(productId, List.of());
    assertEquals(List.of(), adminProductGroupIds(productId));
  }

  @Test void rejectsUnknownModifierGroupOnProduct() throws Exception {
    mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken("admin_grupo_malo"))
            .content(json.writeValueAsString(Map.of(
                "name", "PRODUCTO GRUPO MALO",
                "pricePesos", 10000,
                "modifierGroupIds", List.of(UUID.randomUUID())))))
        .andExpect(status().isBadRequest());
  }

  private UUID createIngredient(String name, String unit, double wastePercent) throws Exception {
    var body = mvc.perform(post("/api/catalog/ingredients").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of(
                "name", name, "unit", unit, "wastePercent", wastePercent))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private UUID createAddon(String name, long pricePesos, UUID ingredientId, double quantity)
      throws Exception {
    var body = mvc.perform(post("/api/catalog/addons").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of(
                "name", name,
                "pricePesos", pricePesos,
                "recipe", List.of(Map.of("ingredientId", ingredientId, "quantity", quantity))))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private void updateAddon(UUID id, boolean active) throws Exception {
    mvc.perform(put("/api/catalog/addons/" + id).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("active", active))))
        .andExpect(status().isNoContent());
  }

  private UUID createProduct(String name, long pricePesos) throws Exception {
    var body = mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("name", name, "pricePesos", pricePesos))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private UUID createProductWithGroups(String name, List<UUID> groupIds) throws Exception {
    var body = mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("name", name, "pricePesos", 10000,
                "modifierGroupIds", groupIds))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private void updateProductGroups(UUID productId, List<UUID> groupIds) throws Exception {
    mvc.perform(put("/api/catalog/products/" + productId).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("modifierGroupIds", groupIds))))
        .andExpect(status().isNoContent());
  }

  @SuppressWarnings("unchecked")
  private List<UUID> adminProductGroupIds(UUID productId) throws Exception {
    var product = ((List<Map<String, Object>>) snapshot("/api/catalog/admin").get("products"))
        .stream()
        .filter(row -> productId.toString().equals(String.valueOf(row.get("id"))))
        .findFirst()
        .orElseThrow();
    return ((List<String>) product.get("modifierGroupIds")).stream()
        .map(UUID::fromString)
        .toList();
  }

  private void deactivateProduct(UUID id) throws Exception {
    updateProductActive(id, false);
  }

  private void updateProductActive(UUID id, boolean active) throws Exception {
    mvc.perform(put("/api/catalog/products/" + id).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("active", active))))
        .andExpect(status().isNoContent());
  }

  private UUID createCategory(String name) throws Exception {
    var body = mvc.perform(post("/api/catalog/categories").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("name", name, "sortOrder", 99))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private void deactivateCategory(UUID id) throws Exception {
    mvc.perform(put("/api/catalog/categories/" + id).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("active", false))))
        .andExpect(status().isNoContent());
  }

  private UUID createModifierGroup(String name) throws Exception {
    var body = mvc.perform(post("/api/catalog/modifier-groups")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of(
                "name", name,
                "minSelection", 0,
                "maxSelection", 1,
                "modifiers", List.of(Map.of("name", "OPCION", "additionalPricePesos", 500))))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private void deactivateModifierGroup(UUID id) throws Exception {
    mvc.perform(put("/api/catalog/modifier-groups/" + id).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("active", false))))
        .andExpect(status().isNoContent());
  }

  private List<String> adminProductNames() throws Exception {
    return names(snapshot("/api/catalog/admin"), "products");
  }

  private List<String> publicProductNames() throws Exception {
    return names(snapshot("/api/catalog"), "products");
  }

  private List<String> adminCategoryNames() throws Exception {
    return names(snapshot("/api/catalog/admin"), "categories");
  }

  private List<String> publicCategoryNames() throws Exception {
    return names(snapshot("/api/catalog"), "categories");
  }

  private List<String> adminGroupNames() throws Exception {
    return names(snapshot("/api/catalog/admin"), "modifierGroups");
  }

  private List<String> publicGroupNames() throws Exception {
    return names(snapshot("/api/catalog"), "modifierGroups");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> snapshot(String path) throws Exception {
    var body = mvc.perform(get(path)
            .header("Authorization", "Bearer " + adminToken()))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return json.readValue(body, Map.class);
  }

  @SuppressWarnings("unchecked")
  private List<String> names(Map<String, Object> snapshot, String key) {
    return ((List<Map<String, Object>>) snapshot.get(key)).stream()
        .map(row -> (String) row.get("name"))
        .toList();
  }

  private String adminToken() throws Exception {
    return adminToken("admin_catalogo_estado");
  }

  private String adminToken(String username) throws Exception {
    return tokenFor(username, "ADMIN");
  }

  private String tokenFor(String username, String role) throws Exception {
    var tenantId = jdbc.queryForObject("select tenant_id from locations where code = 'ALM'",
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
