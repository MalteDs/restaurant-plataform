package com.caja.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
public class UserController {
  private final UserRepository users;
  private final PasswordEncoder passwordEncoder;

  public UserController(UserRepository users, PasswordEncoder passwordEncoder) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
  }

  @GetMapping
  @PreAuthorize("hasRole('ADMIN')")
  public List<UserRepository.AdminUser> list(@AuthenticationPrincipal AuthenticatedUser user) {
    return users.list(user.tenantId(), user.locationId());
  }

  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody UserRequest request,
                                                     @AuthenticationPrincipal AuthenticatedUser user) {
    try {
      var id = users.insert(user.tenantId(), user.locationId(), request.username(),
          passwordEncoder.encode(request.password()), request.role());
      return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El usuario ya existe");
    }
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> update(@PathVariable UUID id,
                                     @Valid @RequestBody UserUpdate request,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
    var updated = users.update(id, user.tenantId(), user.locationId(), request.role(),
        request.active());
    return ResponseEntity.status(updated == 0 ? HttpStatus.NOT_FOUND : HttpStatus.NO_CONTENT)
        .build();
  }

  public record UserRequest(@NotBlank @Size(max = 50) String username,
                             @NotBlank @Size(max = 200) String password,
                             @NotNull @Pattern(regexp = "CASHIER|MANAGER|ADMIN") String role) {
  }

  public record UserUpdate(@Pattern(regexp = "CASHIER|MANAGER|ADMIN") String role, Boolean active) {
  }
}
