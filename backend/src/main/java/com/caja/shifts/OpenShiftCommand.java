package com.caja.shifts;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record OpenShiftCommand(UUID shiftId, UUID tenantId, UUID locationId, UUID deviceId,
                               UUID userId, long openingCashPesos, LocalDate operationalDate) {
}
