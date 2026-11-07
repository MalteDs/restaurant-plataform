package com.caja.sales;

import com.caja.payments.PaymentMethod;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A sale created by the till. Prices and names arrive frozen from the local catalog. */
public record CreateSaleCommand(UUID saleId, UUID tenantId, UUID locationId, UUID deviceId,
                                UUID userId, UUID shiftId, SaleType type, String tableLabel,
                                long deliveryFeePesos,
                                List<ItemCommand> items, PaymentMethod method, UUID operationId,
                                String displayCode, long deviceSeq, Instant clientCreatedAt) {

  public CreateSaleCommand withType(SaleType newType) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, newType,
        tableLabel, deliveryFeePesos, items, method, operationId, displayCode, deviceSeq,
        clientCreatedAt);
  }

  public CreateSaleCommand withTableLabel(String label) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, label,
        deliveryFeePesos, items, method, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public CreateSaleCommand withDeliveryFee(long feePesos) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, tableLabel,
        feePesos, items, method, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public CreateSaleCommand withItems(List<ItemCommand> newItems) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, tableLabel,
        deliveryFeePesos, newItems, method, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public record ItemCommand(UUID productId, String productName, String categoryName, int quantity,
                            long unitPricePesos, Long costPesos, String note,
                            List<ModifierCommand> modifiers, List<ComponentCommand> components) {
  }

  public record ModifierCommand(UUID modifierId, String modifierName, long additionalPricePesos) {
  }

  public record ComponentCommand(UUID productId, String name, int quantity) {
  }
}
