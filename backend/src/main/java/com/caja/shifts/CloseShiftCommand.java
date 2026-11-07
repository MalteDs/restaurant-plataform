package com.caja.shifts;

import java.util.UUID;

public record CloseShiftCommand(UUID tenantId, UUID locationId, UUID shiftId,
                                long countedCashPesos, Long expectedLocalPesos, UUID userId) {
  public CloseShiftCommand(UUID tenantId, UUID locationId, UUID shiftId, long countedCashPesos) {
    this(tenantId, locationId, shiftId, countedCashPesos, null, null);
  }
}
