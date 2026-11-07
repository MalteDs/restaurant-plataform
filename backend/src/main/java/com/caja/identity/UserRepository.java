package com.caja.identity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
  private final JdbcTemplate jdbc;

  public UserRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<User> findActiveByUsername(String username, String locationCode) {
    return jdbc.query("""
        select u.id, u.tenant_id, u.location_id, u.username, u.password_hash, u.role
        from users u
        join locations l on l.id = u.location_id and l.tenant_id = u.tenant_id
        where u.username = ? and u.active
          and (?::varchar is null or l.code = ?::varchar)
        """, (rs, rowNum) -> map(rs), username, locationCode, locationCode);
  }

  public Optional<User> findByRefreshTokenHash(String hash) {
    return jdbc.query("""
        select id, tenant_id, location_id, username, password_hash, role
        from users
        where refresh_token_hash = ? and refresh_token_expires_at > now() and active
        """, (rs, rowNum) -> map(rs), hash).stream().findFirst();
  }

  public void saveRefreshToken(UUID userId, String hash, java.time.Instant expiresAt) {
    jdbc.update("""
        update users
        set refresh_token_hash = ?, refresh_token_expires_at = ?, updated_at = now()
        where id = ?
        """, hash, java.sql.Timestamp.from(expiresAt), userId);
  }

  /** Rotates the refresh token only if the given hash is still the current one. */
  public boolean rotateRefreshToken(UUID userId, String currentHash, String newHash,
                                    java.time.Instant expiresAt) {
    return jdbc.update("""
        update users
        set refresh_token_hash = ?, refresh_token_expires_at = ?, updated_at = now()
        where id = ? and refresh_token_hash = ?
        """, newHash, java.sql.Timestamp.from(expiresAt), userId, currentHash) > 0;
  }

  public List<AdminUser> list(UUID tenantId, UUID locationId) {
    return jdbc.query("""
        select id, username, role, active
        from users
        where tenant_id = ? and location_id = ?
        order by username
        """, (rs, rowNum) -> new AdminUser(
        rs.getObject("id", UUID.class), rs.getString("username"),
        Role.valueOf(rs.getString("role")), rs.getBoolean("active")), tenantId, locationId);
  }

  public UUID insert(UUID tenantId, UUID locationId, String username, String passwordHash,
                     String role) {
    var id = UUID.randomUUID();
    jdbc.update("""
        insert into users(id, tenant_id, location_id, username, password_hash, role)
        values (?, ?, ?, ?, ?, ?::user_role)
        """, id, tenantId, locationId, username, passwordHash, role);
    return id;
  }

  public int update(UUID id, UUID tenantId, UUID locationId, String role, Boolean active) {
    return jdbc.update("""
        update users
        set role = coalesce(?::user_role, role), active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, role, active, id, tenantId, locationId);
  }

  public record AdminUser(UUID id, String username, Role role, boolean active) {
  }

  private User map(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new User(
        rs.getObject("id", UUID.class),
        rs.getObject("tenant_id", UUID.class),
        rs.getObject("location_id", UUID.class),
        rs.getString("username"),
        rs.getString("password_hash"),
        Role.valueOf(rs.getString("role")));
  }
}
