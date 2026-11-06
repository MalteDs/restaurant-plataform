package com.caja.catalog;

import com.caja.shared.tenant.TenantId;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class CatalogQuery {
  private final JdbcTemplate jdbc;

  public CatalogQuery(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<ProductView> findAll(TenantId tenantId, UUID locationId) {
    return jdbc.query("""
        SELECT id, tenant_id, location_id, name, price_pesos
        FROM products
        WHERE tenant_id = ? AND location_id = ?
        ORDER BY sort_order, name
        """, (rs, rowNum) -> new ProductView(
            rs.getObject("id", UUID.class),
            rs.getObject("tenant_id", UUID.class),
            rs.getObject("location_id", UUID.class),
            rs.getString("name"),
            rs.getLong("price_pesos")),
        tenantId.value(), locationId);
  }

  public record ProductView(UUID id, UUID tenantId, UUID locationId, String name, long pricePesos) {
  }
}
