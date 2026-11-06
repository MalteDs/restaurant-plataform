package com.caja.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AuthIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PasswordEncoder passwordEncoder;
  @Autowired ObjectMapper json;

  @Test void loginReturnsTokensAndRejectsBadPassword() throws Exception {
    insertUser("ana_login", "secreto", "CASHIER");

    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", "ana_login", "password", "malo"))))
        .andExpect(status().isUnauthorized());

    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", "ana_login", "password", "secreto"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.user.role").value("CASHIER"));
  }

  @Test void loginRejectsMalformedRequests() throws Exception {
    insertUser("ana_malformed", "secreto", "CASHIER");

    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", "ana_malformed"))))
        .andExpect(status().isBadRequest());
  }

  @Test void refreshIssuesANewAccessTokenAndRejectsTheOldOne() throws Exception {
    insertUser("bob_refresh", "secreto", "MANAGER");
    var login = login("bob_refresh");
    var oldRefresh = (String) login.get("refreshToken");

    mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("refreshToken", oldRefresh))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").isNotEmpty());

    mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("refreshToken", oldRefresh))))
        .andExpect(status().isUnauthorized());
  }

  @Test void sameUsernameInTwoTenantsNeedsTheLocationCode() throws Exception {
    insertUser("gemela", "secreto", "CASHIER", "ALM");
    insertUser("gemela", "secreto", "CASHIER", "CAL");

    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", "gemela", "password", "secreto"))))
        .andExpect(status().isUnauthorized());

    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(
                Map.of("username", "gemela", "password", "secreto", "locationCode", "ALM"))))
        .andExpect(status().isOk());
  }

  @Test void onlyAdminRegistersDevices() throws Exception {
    insertUser("cajero_role", "secreto", "CASHIER");
    insertUser("admin_role", "secreto", "ADMIN");

    mvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + login("cajero_role").get("accessToken"))
            .content(json.writeValueAsString(Map.of("code", "A", "name", "Caja A"))))
        .andExpect(status().isForbidden());

    mvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + login("admin_role").get("accessToken"))
            .content(json.writeValueAsString(Map.of("code", "A", "name", "Caja A"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.deviceToken").isNotEmpty())
        .andExpect(jsonPath("$.deviceId").isNotEmpty());
  }

  @Test void revokedDeviceCannotSync() throws Exception {
    insertUser("admin_revoke", "secreto", "ADMIN");
    var registration = registerDevice("admin_revoke");
    var deviceToken = (String) registration.get("deviceToken");
    var deviceId = (String) registration.get("deviceId");

    mvc.perform(post("/api/sync/operations").header("X-Device-Token", deviceToken))
        .andExpect(status().isNotFound());

    mvc.perform(post("/api/devices/" + deviceId + "/revoke")
            .header("Authorization", "Bearer " + login("admin_revoke").get("accessToken")))
        .andExpect(status().isOk());

    mvc.perform(post("/api/sync/operations").header("X-Device-Token", deviceToken))
        .andExpect(status().isUnauthorized());
  }

  @Test void syncWithoutDeviceTokenIsRejected() throws Exception {
    mvc.perform(post("/api/sync/operations"))
        .andExpect(status().isUnauthorized());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> login(String username) throws Exception {
    var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", username, "password", "secreto"))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return json.readValue(response, Map.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> registerDevice(String admin) throws Exception {
    var response = mvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + login(admin).get("accessToken"))
            .content(json.writeValueAsString(Map.of("code", "A", "name", "Caja A"))))
        .andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    return json.readValue(response, Map.class);
  }

  private UUID insertUser(String username, String password, String role) {
    return insertUser(username, password, role, "ALM");
  }

  private UUID insertUser(String username, String password, String role, String locationCode) {
    var tenantId = UUID.randomUUID();
    var locationId = UUID.randomUUID();
    var userId = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", tenantId, "Karbon");
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, ?, ?)",
        locationId, tenantId, locationCode, "Sede " + locationCode);
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, ?, ?, ?::user_role)", userId, tenantId, locationId, username,
        passwordEncoder.encode(password), role);
    return userId;
  }
}
