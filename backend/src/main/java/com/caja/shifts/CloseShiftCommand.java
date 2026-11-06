package com.caja.shifts;

import java.util.UUID;

public record CloseShiftCommand(UUID tenantId, UUID locationId, UUID shiftId, long countedCashPesos) {
}
