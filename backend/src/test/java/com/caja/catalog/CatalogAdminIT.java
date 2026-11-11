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

  private UUID createProduct(String name, long pricePesos) throws Exception {
    var body = mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("name", name, "pricePesos", pricePesos))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return UUID.fromString((String) json.readValue(body, Map.class).get("id"));
  }

  private void deactivateProduct(UUID id) throws Exception {
    mvc.perform(put("/api/catalog/products/" + id).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + adminToken())
            .content(json.writeValueAsString(Map.of("active", false))))
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
    return tokenFor("admin_catalogo_estado", "ADMIN");
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
