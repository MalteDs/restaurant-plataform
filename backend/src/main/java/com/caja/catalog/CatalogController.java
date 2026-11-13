package com.caja.catalog;

import com.caja.identity.AuthenticatedUser;
import com.caja.shared.tenant.TenantId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
  private final CatalogService catalog;

  public CatalogController(CatalogService catalog) {
    this.catalog = catalog;
  }

  @GetMapping
  public CatalogSnapshot snapshot(@AuthenticationPrincipal AuthenticatedUser user) {
    return catalog.snapshot(new TenantId(user.tenantId()), user.locationId(), false);
  }

  @GetMapping("/admin")
  @PreAuthorize("hasRole('ADMIN')")
  public CatalogSnapshot adminSnapshot(@AuthenticationPrincipal AuthenticatedUser user) {
    return catalog.snapshot(new TenantId(user.tenantId()), user.locationId(), true);
  }

  @PostMapping("/products")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createProduct(
      @Valid @RequestBody ProductRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = catalog.createProduct(new TenantId(user.tenantId()), user.locationId(),
        new CatalogService.ProductInput(request.name(), request.categoryId(),
            request.pricePesos(), request.costPesos(),
            request.kind() == null ? "PRODUCT" : request.kind(), request.saleDays(),
            request.modifierGroupIds(), request.addonIds(), dayPrices(request.dayPrices()),
            recipe(request.recipe()), components(request.components())));
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/products/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateProduct(@PathVariable UUID id,
                                            @Valid @RequestBody ProductUpdate request,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateProduct(new TenantId(user.tenantId()), user.locationId(), id,
        new CatalogService.ProductUpdateInput(request.name(), request.categoryId(),
            request.pricePesos(), request.costPesos(), request.active(), request.saleDays(),
            request.modifierGroupIds(), request.addonIds(), dayPrices(request.dayPrices()),
            recipe(request.recipe()), components(request.components())));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/addons")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createAddon(
      @Valid @RequestBody AddonRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = catalog.createAddon(new TenantId(user.tenantId()), user.locationId(),
        request.name(), request.pricePesos(), request.active(), recipe(request.recipe()));
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/addons/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateAddon(@PathVariable UUID id,
                                          @Valid @RequestBody AddonUpdate request,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateAddon(new TenantId(user.tenantId()), user.locationId(), id, request.name(),
        request.pricePesos(), request.active(), recipe(request.recipe()));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/ingredients")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createIngredient(
      @Valid @RequestBody IngredientRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = catalog.createIngredient(new TenantId(user.tenantId()), user.locationId(),
        request.name(), request.unit(), request.wastePercent());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/ingredients/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateIngredient(@PathVariable UUID id,
                                               @Valid @RequestBody IngredientUpdate request,
                                               @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateIngredient(new TenantId(user.tenantId()), user.locationId(), id, request.name(),
        request.unit(), request.wastePercent(), request.active());
    return ResponseEntity.noContent().build();
  }

  private static List<CatalogService.RecipeItemInput> recipe(List<RecipeItemRequest> items) {
    return items == null ? null : items.stream()
        .map(item -> new CatalogService.RecipeItemInput(item.ingredientId(), item.quantity()))
        .toList();
  }

  private static List<CatalogService.DayPriceInput> dayPrices(List<DayPriceRequest> items) {
    return items == null ? null : items.stream()
        .map(item -> new CatalogService.DayPriceInput(item.weekday(), item.pricePesos()))
        .toList();
  }

  private static List<CatalogService.ComponentInput> components(List<ComponentRequest> items) {
    return items == null ? null : items.stream()
        .map(item -> new CatalogService.ComponentInput(item.productId(), item.quantity()))
        .toList();
  }

  @PostMapping("/categories")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createCategory(
      @Valid @RequestBody CategoryRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = catalog.createCategory(new TenantId(user.tenantId()), user.locationId(),
        request.name(), request.sortOrder() == null ? 0 : request.sortOrder());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/categories/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateCategory(@PathVariable UUID id,
                                              @Valid @RequestBody CategoryUpdate request,
                                              @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateCategory(new TenantId(user.tenantId()), user.locationId(), id, request.name(),
        request.sortOrder(), request.active());
    return ResponseEntity.noContent().build();
  }

  @PutMapping("/modifier-groups/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateModifierGroup(@PathVariable UUID id,
                                                   @Valid @RequestBody ModifierGroupUpdate request,
                                                   @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateModifierGroup(new TenantId(user.tenantId()), user.locationId(), id,
        request.name(), request.active());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/modifier-groups")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createModifierGroup(
      @Valid @RequestBody ModifierGroupRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var modifiers = request.modifiers() == null ? List.<ModifierRequest>of() : request.modifiers();
    var id = catalog.createModifierGroup(new TenantId(user.tenantId()), user.locationId(),
        request.name(), request.minSelection() == null ? 0 : request.minSelection(),
        request.maxSelection() == null ? 1 : request.maxSelection(),
        modifiers.stream()
            .map(modifier -> new CatalogService.ModifierInput(modifier.name(),
                modifier.additionalPricePesos()))
            .toList());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  public record ProductRequest(@NotBlank @Size(max = 100) String name,
                               UUID categoryId,
                               @NotNull @PositiveOrZero Long pricePesos,
                               @PositiveOrZero Long costPesos,
                               @Pattern(regexp = "PRODUCT|COMBO") String kind,
                               List<@NotNull @Min(1) @Max(7) Integer> saleDays,
                               List<@NotNull UUID> modifierGroupIds,
                               List<@NotNull UUID> addonIds,
                               List<@NotNull @Valid DayPriceRequest> dayPrices,
                               List<@NotNull @Valid RecipeItemRequest> recipe,
                               List<@NotNull @Valid ComponentRequest> components) {
  }

  public record ProductUpdate(@Size(max = 100) String name,
                               UUID categoryId,
                               @PositiveOrZero Long pricePesos,
                               @PositiveOrZero Long costPesos,
                               Boolean active,
                               List<@NotNull @Min(1) @Max(7) Integer> saleDays,
                               List<@NotNull UUID> modifierGroupIds,
                               List<@NotNull UUID> addonIds,
                               List<@NotNull @Valid DayPriceRequest> dayPrices,
                               List<@NotNull @Valid RecipeItemRequest> recipe,
                               List<@NotNull @Valid ComponentRequest> components) {
  }

  public record CategoryRequest(@NotBlank @Size(max = 100) String name, Integer sortOrder) {
  }

  public record ModifierGroupRequest(@NotBlank @Size(max = 100) String name,
                                     @Min(0) Integer minSelection,
                                     @Min(1) Integer maxSelection,
                                     List<@NotNull @Valid ModifierRequest> modifiers) {
  }

  public record CategoryUpdate(@Size(max = 100) String name, Integer sortOrder, Boolean active) {
  }

  public record ModifierGroupUpdate(@Size(max = 100) String name, Boolean active) {
  }

  public record ModifierRequest(@NotBlank @Size(max = 100) String name,
                                 @NotNull @PositiveOrZero Long additionalPricePesos) {
  }

  public record AddonRequest(@NotBlank @Size(max = 100) String name,
                             @NotNull @PositiveOrZero Long pricePesos,
                             Boolean active,
                             List<@NotNull @Valid RecipeItemRequest> recipe) {
  }

  public record AddonUpdate(@Size(max = 100) String name,
                            @PositiveOrZero Long pricePesos,
                            Boolean active,
                            List<@NotNull @Valid RecipeItemRequest> recipe) {
  }

  public record IngredientRequest(@NotBlank @Size(max = 100) String name,
                                  @NotBlank @Pattern(regexp = "UNIT|GRAM") String unit,
                                  @DecimalMin("0") @DecimalMax("100") BigDecimal wastePercent) {
  }

  public record IngredientUpdate(@Size(max = 100) String name,
                                 @Pattern(regexp = "UNIT|GRAM") String unit,
                                 @DecimalMin("0") @DecimalMax("100") BigDecimal wastePercent,
                                 Boolean active) {
  }

  public record RecipeItemRequest(@NotNull UUID ingredientId,
                                  @NotNull @DecimalMin("0.001") BigDecimal quantity) {
  }

  public record DayPriceRequest(@NotNull @Min(1) @Max(7) Integer weekday,
                                @NotNull @PositiveOrZero Long pricePesos) {
  }

  public record ComponentRequest(@NotNull UUID productId,
                                 @NotNull @Min(1) @Max(99) Integer quantity) {
  }
}
