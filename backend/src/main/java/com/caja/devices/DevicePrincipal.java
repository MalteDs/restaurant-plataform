package com.caja.devices;

import java.util.UUID;

/** Identity carried by a validated device token. */
public record DevicePrincipal(UUID deviceId, UUID tenantId, UUID locationId) {
}
