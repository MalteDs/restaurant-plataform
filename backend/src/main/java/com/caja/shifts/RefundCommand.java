package com.caja.shifts;

import java.time.Instant;
import java.util.UUID;

/** A full refund of a sale, charged to the shift that is open when the refund happens. */
public record RefundCommand(UUID tenantId, UUID locationId, UUID deviceId, UUID userId,
                            UUID shiftId, UUID saleId, String method, String reason,
                            Instant clientCreatedAt) {
}
