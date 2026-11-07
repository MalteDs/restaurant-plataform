package com.caja.locations;

import com.caja.identity.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/locations")
public class LocationController {
  private final LocationRepository locations;

  public LocationController(LocationRepository locations) {
    this.locations = locations;
  }

  @GetMapping("/current")
  public LocationRepository.Location current(@AuthenticationPrincipal AuthenticatedUser user) {
    return locations.current(user.tenantId(), user.locationId());
  }

  @PutMapping("/current")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> update(@Valid @RequestBody LocationRequest request,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
    try {
      locations.update(user.tenantId(), user.locationId(), request.name(), request.code());
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El codigo de sede ya existe");
    }
    return ResponseEntity.noContent().build();
  }

  public record LocationRequest(@Size(max = 100) String name, @Size(max = 8) String code) {
  }
}
