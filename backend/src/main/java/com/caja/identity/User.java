package com.caja.identity;

import java.util.UUID;

public record User(UUID id, UUID tenantId, UUID locationId, String username, String passwordHash,
                   Role role) {
}
