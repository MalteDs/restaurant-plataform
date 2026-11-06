package com.caja.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/login")
  public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest request) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(body(auth.login(request.username(), request.password(), request.locationCode())));
  }

  @PostMapping("/refresh")
  public ResponseEntity<Map<String, Object>> refresh(@Valid @RequestBody RefreshRequest request) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(body(auth.refresh(request.refreshToken())));
  }

  private Map<String, Object> body(AuthService.Session session) {
    return Map.of(
        "accessToken", session.accessToken(),
        "refreshToken", session.refreshToken(),
        "user", Map.of(
            "id", session.userId(),
            "username", session.username(),
            "role", session.role().name(),
            "tenantId", session.tenantId(),
            "locationId", session.locationId()));
  }

  public record LoginRequest(@NotBlank @Size(max = 50) String username,
                             @NotNull @Size(max = 200) String password,
                             @Size(max = 8) String locationCode) {
  }

  public record RefreshRequest(@NotBlank String refreshToken) {
  }
}
