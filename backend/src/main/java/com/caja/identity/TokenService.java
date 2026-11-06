package com.caja.identity;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
  private final SecretKey key;
  private final Duration accessTtl;
  private final Duration refreshTtl;
  private final SecureRandom random = new SecureRandom();

  public TokenService(@Value("${caja.jwt.secret}") String secret,
                      @Value("${caja.jwt.access-ttl-minutes:15}") long accessTtlMinutes,
                      @Value("${caja.jwt.refresh-ttl-days:30}") long refreshTtlDays) {
    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.accessTtl = Duration.ofMinutes(accessTtlMinutes);
    this.refreshTtl = Duration.ofDays(refreshTtlDays);
  }

  public String accessToken(User user) {
    var now = Instant.now();
    return Jwts.builder()
        .subject(user.id().toString())
        .claim("tenant", user.tenantId().toString())
        .claim("location", user.locationId().toString())
        .claim("role", user.role().name())
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(accessTtl)))
        .signWith(key, Jwts.SIG.HS256)
        .compact();
  }

  public Optional<AuthenticatedUser> parseAccessToken(String token) {
    try {
      Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
      return Optional.of(new AuthenticatedUser(
          UUID.fromString(claims.getSubject()),
          UUID.fromString(claims.get("tenant", String.class)),
          UUID.fromString(claims.get("location", String.class)),
          Role.valueOf(claims.get("role", String.class))));
    } catch (RuntimeException e) {
      return Optional.empty();
    }
  }

  public String newRefreshToken() {
    var bytes = new byte[32];
    random.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public String sha256Hex(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 no disponible", e);
    }
  }

  public Duration refreshTtl() {
    return refreshTtl;
  }
}
