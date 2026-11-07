package com.caja.locations;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LocationRepository {
  private final JdbcTemplate jdbc;

  public LocationRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Location current(UUID tenantId, UUID locationId) {
    return jdbc.query("""
        select id, code, name, catalog_version
        from locations
        where id = ? and tenant_id = ?
        """, (rs, rowNum) -> new Location(
        rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
        rs.getLong("catalog_version")), locationId, tenantId).stream().findFirst()
        .orElseThrow(() -> new IllegalStateException("Sede no encontrada"));
  }

  public int update(UUID tenantId, UUID locationId, String name, String code) {
    return jdbc.update("""
        update locations set name = coalesce(?, name), code = coalesce(?, code)
        where id = ? and tenant_id = ?
        """, name, code, locationId, tenantId);
  }

  public record Location(UUID id, String code, String name, long catalogVersion) {
  }
}
