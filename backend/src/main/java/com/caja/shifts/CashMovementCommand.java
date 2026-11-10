package com.caja.shifts;

import java.time.LocalDate;
import java.util.UUID;

public record CashMovementCommand(UUID tenantId, UUID locationId, UUID shiftId, UUID userId,
                                  UUID movementId, String type, long amountPesos, String reason,
                                  String expenseCategoryName, UUID replacesMovementId,
                                  boolean voided, LocalDate operationalDate) {
}
