package com.caja.identity;

import java.util.UUID;

/** Identity carried by a validated access token. */
public record AuthenticatedUser(UUID userId, UUID tenantId, UUID locationId, Role role) {
}
