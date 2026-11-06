package com.caja.devices;

import java.util.UUID;

public record Device(UUID id, UUID tenantId, UUID locationId, String code, String name,
                     String tokenHash, DeviceStatus status) {
}
