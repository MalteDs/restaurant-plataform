package com.caja.shared;

import com.caja.catalog.CatalogService;
import com.caja.shared.tenant.TenantId;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Testcontainers
class TenantIsolationIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired JdbcTemplate jdbc;
  @Autowired CatalogService catalog;

  @Test void cannotReadAnotherTenantOrLocation() {
    var otherTenant = insertTenant("otro");
    var mine = insertTenant("mio");
    var myLocation = insertLocation(mine, "ALM");
    var anotherLocation = insertLocation(mine, "CAL");
    insertProduct(mine, myLocation, "Sencilla", 16500);
    insertProduct(mine, anotherLocation, "Otra sede", 2000);
    insertProduct(otherTenant, insertLocation(otherTenant, "OTR"), "Ajena", 1000);

    var visible = catalog.findAll(new TenantId(mine), myLocation);
    assertEquals(1, visible.size());
    assertTrue(visible.stream().allMatch(p -> p.tenantId().equals(mine)));
    assertEquals("Sencilla", visible.get(0).name());

    var otherLocationProducts = catalog.findAll(new TenantId(mine), anotherLocation);
    assertEquals(1, otherLocationProducts.size());
    assertEquals("Otra sede", otherLocationProducts.get(0).name());
    assertEquals(0, catalog.findAll(new TenantId(otherTenant), myLocation).size());

    assertThrows(DataIntegrityViolationException.class,
        () -> insertProduct(otherTenant, myLocation, "Cruzado", 1000));
  }

  private UUID insertTenant(String name) {
    var id = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", id, name);
    return id;
  }

  private UUID insertLocation(UUID tenantId, String code) {
    var id = UUID.randomUUID();
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, ?, ?)",
        id, tenantId, code, "Sede " + code);
    return id;
  }

  private void insertProduct(UUID tenantId, UUID locationId, String name, long pricePesos) {
    jdbc.update("insert into products(id, tenant_id, location_id, name, kind, price_pesos) "
        + "values (?, ?, ?, ?, 'PRODUCT', ?)", UUID.randomUUID(), tenantId, locationId, name, pricePesos);
  }
}
