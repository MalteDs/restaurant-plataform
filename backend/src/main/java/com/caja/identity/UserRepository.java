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
