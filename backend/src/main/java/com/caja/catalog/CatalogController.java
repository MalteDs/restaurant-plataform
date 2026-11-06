package com.caja.catalog;

import com.caja.identity.AuthenticatedUser;
import com.caja.shared.tenant.TenantId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
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
    return catalog.snapshot(new TenantId(user.tenantId()), user.locationId());
  }

  @PostMapping("/products")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createProduct(
      @Valid @RequestBody ProductRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = catalog.createProduct(new TenantId(user.tenantId()), user.locationId(),
        request.name(), request.categoryId(), request.pricePesos(), request.costPesos(),
        request.kind() == null ? "PRODUCT" : request.kind());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/products/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateProduct(@PathVariable UUID id,
                                            @Valid @RequestBody ProductUpdate request,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
    catalog.updateProduct(new TenantId(user.tenantId()), user.locationId(), id, request.name(),
        request.pricePesos(), request.costPesos(), request.active());
    return ResponseEntity.noContent().build();
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
                               String categoryId,
                               @NotNull @PositiveOrZero Long pricePesos,
                               @PositiveOrZero Long costPesos,
                               String kind) {
  }

  public record ProductUpdate(@Size(max = 100) String name,
                               @PositiveOrZero Long pricePesos,
                               @PositiveOrZero Long costPesos,
                               Boolean active) {
  }

  public record CategoryRequest(@NotBlank @Size(max = 100) String name, Integer sortOrder) {
  }

  public record ModifierGroupRequest(@NotBlank @Size(max = 100) String name,
                                     @Min(0) Integer minSelection,
                                     @Min(1) Integer maxSelection,
                                     List<@Valid ModifierRequest> modifiers) {
  }

  public record ModifierRequest(@NotBlank @Size(max = 100) String name,
                                 @NotNull @PositiveOrZero Long additionalPricePesos) {
  }
}
