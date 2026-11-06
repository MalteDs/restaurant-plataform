package com.caja.shifts;

import java.util.UUID;

public record ShiftClose(UUID shiftId, long expectedPesos, long differencePesos) {
}
