package com.caja.devices;

import com.caja.identity.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceRegistrationController {
  private final DeviceService devices;

  public DeviceRegistrationController(DeviceService devices) {
    this.devices = devices;
  }

  @GetMapping
  @PreAuthorize("hasRole('ADMIN')")
  public java.util.List<Device> list(@AuthenticationPrincipal AuthenticatedUser user) {
    return devices.list(user.tenantId(), user.locationId());
  }

  @PostMapping("/register")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody DeviceRequest request,
                                                      @AuthenticationPrincipal AuthenticatedUser user) {
    var registration = devices.register(request.code(), request.name(), user.tenantId(),
        user.locationId());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
        "deviceId", registration.deviceId(),
        "deviceToken", registration.deviceToken(),
        "code", request.code()));
  }

  @PostMapping("/{deviceId}/revoke")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> revoke(@PathVariable UUID deviceId,
                                                     @AuthenticationPrincipal AuthenticatedUser user) {
    var revoked = devices.revoke(deviceId, user.tenantId(), user.locationId());
    return ResponseEntity.status(revoked ? HttpStatus.OK : HttpStatus.NOT_FOUND)
        .body(Map.of("revoked", revoked));
  }

  public record DeviceRequest(@NotBlank @Size(max = 8) String code,
                               @NotBlank @Size(max = 100) String name) {
  }
}
