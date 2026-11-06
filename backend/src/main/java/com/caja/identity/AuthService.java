package com.caja.identity;

import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
  /** Burned on unknown users so the response time does not reveal whether they exist. */
  private static final String DUMMY_HASH =
      "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

  private final UserRepository users;
  private final TokenService tokens;
  private final PasswordEncoder passwordEncoder;

  public AuthService(UserRepository users, TokenService tokens, PasswordEncoder passwordEncoder) {
    this.users = users;
    this.tokens = tokens;
    this.passwordEncoder = passwordEncoder;
  }

  public Session login(String username, String password, String locationCode) {
    var candidates = users.findActiveByUsername(username, locationCode);
    if (candidates.size() != 1) {
      passwordEncoder.matches(password == null ? "" : password, DUMMY_HASH);
      throw unauthorized();
    }
    var user = candidates.get(0);
    if (password == null || !passwordEncoder.matches(password, user.passwordHash())) {
      throw unauthorized();
    }
    return issue(user);
  }

  public Session refresh(String refreshToken) {
    if (refreshToken == null || refreshToken.isBlank()) {
      throw unauthorized();
    }
    var currentHash = tokens.sha256Hex(refreshToken);
    var user = users.findByRefreshTokenHash(currentHash).orElseThrow(AuthService::unauthorized);
    return issue(user, currentHash);
  }

  private Session issue(User user) {
    return issue(user, null);
  }

  private Session issue(User user, String currentHash) {
    var refreshToken = tokens.newRefreshToken();
    var newHash = tokens.sha256Hex(refreshToken);
    var expiresAt = Instant.now().plus(tokens.refreshTtl());
    if (currentHash == null) {
      users.saveRefreshToken(user.id(), newHash, expiresAt);
    } else if (!users.rotateRefreshToken(user.id(), currentHash, newHash, expiresAt)) {
      // Another refresh already rotated this token: reject the losing client.
      throw unauthorized();
    }
    return new Session(tokens.accessToken(user), refreshToken, user.id(), user.username(),
        user.role(), user.tenantId(), user.locationId());
  }

  private static ResponseStatusException unauthorized() {
    return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales invalidas");
  }

  public record Session(String accessToken, String refreshToken, UUID userId, String username,
                        Role role, UUID tenantId, UUID locationId) {
  }
}
