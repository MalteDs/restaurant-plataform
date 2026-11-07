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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AdminIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PasswordEncoder passwordEncoder;
  @Autowired ObjectMapper json;

  @Test void adminManagesUsers() throws Exception {
    var ctx = fixture();
    var admin = token(ctx, "admin_usuarios", "ADMIN");

    mvc.perform(get("/api/users").header("Authorization", "Bearer " + admin))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[1].username").value(ctx.cashier()));

    mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + admin)
            .content(json.writeValueAsString(Map.of("username", "nuevo", "password", "secreto",
                "role", "CASHIER"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNotEmpty());

    var nuevoId = jdbc.queryForObject("select id from users where username = 'nuevo'", UUID.class);
    mvc.perform(put("/api/users/" + nuevoId).contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + admin)
            .content(json.writeValueAsString(Map.of("active", false))))
        .andExpect(status().isNoContent());
    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", "nuevo", "password", "secreto",
                "locationCode", "ALM"))))
        .andExpect(status().isUnauthorized());

    mvc.perform(get("/api/users").header("Authorization", "Bearer " + token(ctx, ctx.cashier(),
            "CASHIER")))
        .andExpect(status().isForbidden());
  }

  @Test void adminListsDevicesAndUpdatesTheLocation() throws Exception {
    var ctx = fixture();
    var admin = token(ctx, "admin_sede", "ADMIN");

    mvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + admin)
            .content(json.writeValueAsString(Map.of("code", "A", "name", "Caja A"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.code").value("A"));

    mvc.perform(get("/api/devices").header("Authorization", "Bearer " + admin))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].code").value("A"))
        .andExpect(jsonPath("$[0].tokenHash").isNotEmpty());

    mvc.perform(put("/api/locations/current").contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer " + admin)
            .content(json.writeValueAsString(Map.of("name", "Almendros Nuevo"))))
        .andExpect(status().isNoContent());

    mvc.perform(get("/api/locations/current").header("Authorization", "Bearer " + admin))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Almendros Nuevo"))
        .andExpect(jsonPath("$.code").value("ALM"));
  }

  private record Ctx(UUID tenantId, UUID locationId, String cashier) {
  }

  private Ctx fixture() {
    var tenantId = UUID.randomUUID();
    var locationId = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", tenantId, "Karbon");
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, 'ALM', 'Almendros')",
        locationId, tenantId);
    var cashier = "cajero_" + tenantId.toString().substring(0, 8);
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
            + "values (?, ?, ?, ?, ?, 'CASHIER')", UUID.randomUUID(), tenantId,
        locationId, cashier, passwordEncoder.encode("secreto"));
    return new Ctx(tenantId, locationId, cashier);
  }

  private String token(Ctx ctx, String username, String role) throws Exception {
    var exists = jdbc.query("select id from users where tenant_id = ? and username = ?",
        (rs, rowNum) -> rs.getObject("id", UUID.class), ctx.tenantId(), username)
        .stream().findFirst();
    if (exists.isEmpty()) {
      jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
          + "values (?, ?, ?, ?, ?, ?::user_role)", UUID.nameUUIDFromBytes(
          (username + ctx.tenantId()).getBytes()), ctx.tenantId(), ctx.locationId(), username,
          passwordEncoder.encode("secreto"), role);
    }
    var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", username, "password", "secreto",
                "locationCode", "ALM"))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    return (String) json.readValue(response, Map.class).get("accessToken");
  }
}
