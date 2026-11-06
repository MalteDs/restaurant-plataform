package com.caja.shifts;

import java.util.UUID;

public record Refund(UUID id, UUID saleId, long amountPesos, String method) {
}
