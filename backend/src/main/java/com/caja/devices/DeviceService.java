package com.caja.devices;

import com.caja.identity.TokenService;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeviceService {
  private final DeviceRepository devices;
  private final TokenService tokens;

  public DeviceService(DeviceRepository devices, TokenService tokens) {
    this.devices = devices;
    this.tokens = tokens;
  }

  public Registration register(String code, String name, UUID tenantId, UUID locationId) {
    var token = tokens.newRefreshToken();
    try {
      var device = devices.insert(tenantId, locationId, code, name, tokens.sha256Hex(token));
      return new Registration(device.id(), token);
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El codigo de dispositivo ya existe");
    }
  }

  public java.util.List<Device> list(UUID tenantId, UUID locationId) {
    return devices.list(tenantId, locationId);
  }

  public boolean revoke(UUID deviceId, UUID tenantId, UUID locationId) {
    return devices.revoke(deviceId, tenantId, locationId) > 0;
  }

  public record Registration(UUID deviceId, String deviceToken) {
  }
}
