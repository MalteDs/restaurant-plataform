package com.caja.sales;

import java.util.UUID;

public record AppliedSale(UUID id, UUID shiftId, SaleType type, String displayCode, long totalPesos,
                          long deliveryFeePesos) {
}
