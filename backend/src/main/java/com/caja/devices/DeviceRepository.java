package com.caja.devices;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceRepository {
  private final JdbcTemplate jdbc;

  public DeviceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<Device> findActiveByTokenHash(String tokenHash) {
    return jdbc.query("""
        select id, tenant_id, location_id, code, name, token_hash, status
        from devices
        where token_hash = ? and status = 'ACTIVE'
        """, (rs, rowNum) -> new Device(
        rs.getObject("id", UUID.class),
        rs.getObject("tenant_id", UUID.class),
        rs.getObject("location_id", UUID.class),
        rs.getString("code"),
        rs.getString("name"),
        rs.getString("token_hash"),
        DeviceStatus.valueOf(rs.getString("status"))), tokenHash).stream().findFirst();
  }

  public Device insert(UUID tenantId, UUID locationId, String code, String name, String tokenHash) {
    var id = UUID.randomUUID();
    jdbc.update("""
        insert into devices(id, tenant_id, location_id, code, name, token_hash, status)
        values (?, ?, ?, ?, ?, ?, 'ACTIVE')
        """, id, tenantId, locationId, code, name, tokenHash);
    return new Device(id, tenantId, locationId, code, name, tokenHash, DeviceStatus.ACTIVE);
  }

  public void touch(UUID deviceId) {
    jdbc.update("update devices set last_seen_at = now() where id = ?", deviceId);
  }

  public int revoke(UUID deviceId, UUID tenantId, UUID locationId) {
    return jdbc.update("""
        update devices
        set status = 'REVOKED'
        where id = ? and tenant_id = ? and location_id = ? and status = 'ACTIVE'
        """, deviceId, tenantId, locationId);
  }
}
