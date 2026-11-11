package com.caja.catalog;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CatalogSnapshot(long version, List<CategoryView> categories, List<ProductView> products,
                              List<ModifierGroupView> modifierGroups, List<AddonView> addons,
                              List<IngredientView> ingredients) {
  public record CategoryView(UUID id, String name, int sortOrder, boolean active) {
  }

  public record ProductView(UUID id, UUID tenantId, UUID locationId, UUID categoryId,
                            String categoryName, String kind, String name, long pricePesos,
                            Long costPesos, int sortOrder, boolean active,
                            List<UUID> modifierGroupIds, List<ComponentView> components,
                            List<Integer> saleDays, List<UUID> addonIds,
                            List<DayPriceView> dayPrices, List<RecipeItemView> recipe) {
  }

  public record DayPriceView(int weekday, long pricePesos) {
  }

  public record ComponentView(UUID productId, String name, int quantity) {
  }

  public record ModifierGroupView(UUID id, String name, int minSelection, int maxSelection,
                                  boolean active, List<ModifierView> modifiers) {
  }

  public record ModifierView(UUID id, String name, long additionalPricePesos) {
  }

  public record AddonView(UUID id, String name, long pricePesos, boolean active,
                          List<RecipeItemView> recipe) {
  }

  public record IngredientView(UUID id, String name, String unit, BigDecimal wastePercent,
                               boolean active) {
  }

  public record RecipeItemView(UUID ingredientId, BigDecimal quantity) {
  }
}
