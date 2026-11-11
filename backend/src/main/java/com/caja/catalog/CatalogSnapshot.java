package com.caja.catalog;

import java.util.List;
import java.util.UUID;

public record CatalogSnapshot(long version, List<CategoryView> categories, List<ProductView> products,
                              List<ModifierGroupView> modifierGroups) {
  public record CategoryView(UUID id, String name, int sortOrder, boolean active) {
  }

  public record ProductView(UUID id, UUID tenantId, UUID locationId, UUID categoryId,
                            String categoryName, String kind, String name, long pricePesos,
                            Long costPesos, int sortOrder, boolean active,
                            List<UUID> modifierGroupIds, List<ComponentView> components,
                            List<Integer> saleDays) {
  }

  public record ComponentView(UUID productId, String name, int quantity) {
  }

  public record ModifierGroupView(UUID id, String name, int minSelection, int maxSelection,
                                  boolean active, List<ModifierView> modifiers) {
  }

  public record ModifierView(UUID id, String name, long additionalPricePesos) {
  }
}
