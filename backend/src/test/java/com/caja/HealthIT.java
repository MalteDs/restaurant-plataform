package com.caja;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class HealthIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired TestRestTemplate rest;

  @SuppressWarnings("unchecked")
  @Test void healthIsUp() {
    var body = rest.getForObject("/actuator/health", Map.class);
    assertEquals("UP", body.get("status"));
    var components = (Map<String, Object>) body.get("components");
    assertNotNull(components);
    var db = (Map<String, Object>) components.get("db");
    assertNotNull(db);
    assertEquals("UP", db.get("status"));
  }
}
