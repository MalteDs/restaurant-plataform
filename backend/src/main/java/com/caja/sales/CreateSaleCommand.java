package com.caja.sales;

import com.caja.payments.PaymentMethod;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A sale created by the till. Prices and names arrive frozen from the local catalog. */
public record CreateSaleCommand(UUID saleId, UUID tenantId, UUID locationId, UUID deviceId,
                                UUID userId, UUID shiftId, SaleType type, String tableLabel,
                                long deliveryFeePesos,
                                List<ItemCommand> items, List<PaymentCommand> payments,
                                UUID operationId, String displayCode, long deviceSeq,
                                Instant clientCreatedAt) {

  public CreateSaleCommand withType(SaleType newType) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, newType,
        tableLabel, deliveryFeePesos, items, payments, operationId, displayCode, deviceSeq,
        clientCreatedAt);
  }

  public CreateSaleCommand withTableLabel(String label) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, label,
        deliveryFeePesos, items, payments, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public CreateSaleCommand withDeliveryFee(long feePesos) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, tableLabel,
        feePesos, items, payments, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public CreateSaleCommand withItems(List<ItemCommand> newItems) {
    return new CreateSaleCommand(saleId, tenantId, locationId, deviceId, userId, shiftId, type, tableLabel,
        deliveryFeePesos, newItems, payments, operationId, displayCode, deviceSeq, clientCreatedAt);
  }

  public long totalPesos() {
    return totalOf(items, deliveryFeePesos);
  }

  public static long totalOf(List<ItemCommand> items, long deliveryFeePesos) {
    return items.stream().mapToLong(CreateSaleCommand::lineTotal).sum() + deliveryFeePesos;
  }

  public static long lineTotal(ItemCommand item) {
    var modifiers = item.modifiers().stream()
        .mapToLong(ModifierCommand::additionalPricePesos).sum();
    var addons = item.addons().stream()
        .mapToLong(addon -> addon.additionalPricePesos() * addon.quantity()).sum();
    return (long) item.quantity() * (item.unitPricePesos() + modifiers + addons);
  }

  public record ItemCommand(UUID productId, String productName, String categoryName, int quantity,
                            long unitPricePesos, Long costPesos, String note,
                            List<ModifierCommand> modifiers, List<AddonCommand> addons,
                            List<ComponentCommand> components,
                            long catalogUnitPricePesos, String overrideReason) {
  }

  public record ModifierCommand(UUID modifierId, String modifierName, long additionalPricePesos) {
  }

  public record AddonCommand(UUID addonId, String addonName, long additionalPricePesos,
                             int quantity) {
  }

  public record ComponentCommand(UUID productId, String name, int quantity) {
  }

  public record PaymentCommand(PaymentMethod method, long amountPesos) {
  }
}
