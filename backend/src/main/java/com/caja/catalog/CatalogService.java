package com.caja.catalog;

import com.caja.catalog.CatalogSnapshot.CategoryView;
import com.caja.catalog.CatalogSnapshot.ComponentView;
import com.caja.catalog.CatalogSnapshot.ModifierGroupView;
import com.caja.catalog.CatalogSnapshot.ModifierView;
import com.caja.catalog.CatalogSnapshot.ProductView;
import com.caja.audit.AuditService;
import com.caja.shared.tenant.TenantId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogService {
  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public CatalogService(JdbcTemplate jdbc, AuditService audit) {
    this.jdbc = jdbc;
    this.audit = audit;
  }

  public List<ProductView> findAll(TenantId tenantId, UUID locationId) {
    return snapshot(tenantId, locationId).products();
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public CatalogSnapshot snapshot(TenantId tenantId, UUID locationId) {
    var version = jdbc.query("""
        select catalog_version from locations where id = ? and tenant_id = ?
        """, (rs, rowNum) -> rs.getLong("catalog_version"), locationId, tenantId.value())
        .stream().findFirst().orElse(0L);

    var categories = jdbc.query("""
        select id, name, sort_order, active
        from categories
        where tenant_id = ? and location_id = ? and active
        order by sort_order, name
        """, (rs, rowNum) -> new CategoryView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("sort_order"),
        rs.getBoolean("active")), tenantId.value(), locationId);

    var products = jdbc.query("""
        select p.id, p.tenant_id, p.location_id, p.category_id,
               coalesce(c.name, '') as category_name, p.kind, p.name, p.price_pesos, p.cost_pesos,
               p.sort_order, p.active
        from products p
        left join categories c
          on c.id = p.category_id and c.tenant_id = p.tenant_id and c.location_id = p.location_id
        where p.tenant_id = ? and p.location_id = ? and p.active
        order by p.sort_order, p.name
        """, (rs, rowNum) -> new ProductView(
        rs.getObject("id", UUID.class), rs.getObject("tenant_id", UUID.class),
        rs.getObject("location_id", UUID.class), rs.getObject("category_id", UUID.class),
        rs.getString("category_name"), rs.getString("kind"),
        rs.getString("name"), rs.getLong("price_pesos"),
        (Long) rs.getObject("cost_pesos"), rs.getInt("sort_order"), rs.getBoolean("active"),
        new ArrayList<>(), new ArrayList<>()), tenantId.value(), locationId);

    var groups = jdbc.query("""
        select id, name, min_selection, max_selection
        from modifier_groups
        where tenant_id = ? and location_id = ? and active
        order by name
        """, (rs, rowNum) -> new ModifierGroupView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("min_selection"),
        rs.getInt("max_selection"), new ArrayList<>()), tenantId.value(), locationId);

    var modifiersByGroup = new LinkedHashMap<UUID, List<ModifierView>>();
    jdbc.query("""
        select id, modifier_group_id, name, additional_price_pesos
        from modifiers
        where tenant_id = ? and location_id = ? and active
        order by name
        """, (RowCallbackHandler) rs -> {
          modifiersByGroup.computeIfAbsent(rs.getObject("modifier_group_id", UUID.class),
              key -> new ArrayList<>())
              .add(new ModifierView(rs.getObject("id", UUID.class), rs.getString("name"),
                  rs.getLong("additional_price_pesos")));
        }, tenantId.value(), locationId);

    var groupsByProduct = new LinkedHashMap<UUID, List<UUID>>();
    jdbc.query("""
        select product_id, modifier_group_id
        from product_modifier_groups
        where tenant_id = ? and location_id = ?
        """, (RowCallbackHandler) rs -> groupsByProduct
        .computeIfAbsent(rs.getObject("product_id", UUID.class), key -> new ArrayList<>())
        .add(rs.getObject("modifier_group_id", UUID.class)), tenantId.value(), locationId);

    var componentsByProduct = new LinkedHashMap<UUID, List<ComponentView>>();
    jdbc.query("""
        select cc.combo_product_id, cc.component_product_id, p.name, cc.quantity
        from combo_components cc
        join products p
          on p.id = cc.component_product_id and p.tenant_id = cc.tenant_id
         and p.location_id = cc.location_id
        where cc.tenant_id = ? and cc.location_id = ?
        order by p.name
        """, (RowCallbackHandler) rs -> componentsByProduct
        .computeIfAbsent(rs.getObject("combo_product_id", UUID.class), key -> new ArrayList<>())
        .add(new ComponentView(rs.getObject("component_product_id", UUID.class),
            rs.getString("name"), rs.getInt("quantity"))), tenantId.value(), locationId);

    var productsById = new LinkedHashMap<UUID, ProductView>();
    for (var product : products) {
      product.modifierGroupIds().addAll(groupsByProduct.getOrDefault(product.id(), List.of()));
      product.components().addAll(componentsByProduct.getOrDefault(product.id(), List.of()));
      productsById.put(product.id(), product);
    }
    for (var group : groups) {
      group.modifiers().addAll(modifiersByGroup.getOrDefault(group.id(), List.of()));
    }

    return new CatalogSnapshot(version, categories, products, groups);
  }

  @Transactional
  public UUID createProduct(TenantId tenantId, UUID locationId, String name, UUID categoryId,
                            long pricePesos, Long costPesos, String kind) {
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into products(id, tenant_id, location_id, category_id, kind, name, price_pesos,
                               cost_pesos)
          values (?, ?, ?, ?, ?::product_kind, ?, ?, ?)
          """, id, tenantId.value(), locationId, categoryId, kind, name, pricePesos, costPesos);
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El producto ya existe o es invalido");
    }
    bumpVersion(tenantId, locationId);
    audit.record(tenantId.value(), locationId, null, "CATALOG_PRODUCT_CREATED", "product", id,
        Map.of("name", name, "pricePesos", pricePesos));
    return id;
  }

  @Transactional
  public void updateProduct(TenantId tenantId, UUID locationId, UUID productId, String name,
                            UUID categoryId, Long pricePesos, Long costPesos, Boolean active) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update products
        set name = coalesce(?, name), category_id = coalesce(?, category_id),
            price_pesos = coalesce(?, price_pesos), cost_pesos = coalesce(?, cost_pesos),
            active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name, categoryId, pricePesos, costPesos, active, productId, tenantId.value(),
        locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Producto no encontrado");
    }
    bumpVersion(tenantId, locationId);
  }

  @Transactional
  public UUID createCategory(TenantId tenantId, UUID locationId, String name, int sortOrder) {
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into categories(id, tenant_id, location_id, name, sort_order)
          values (?, ?, ?, ?, ?)
          """, id, tenantId.value(), locationId, name, sortOrder);
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "La categoria ya existe");
    }
    bumpVersion(tenantId, locationId);
    return id;
  }

  @Transactional
  public UUID createModifierGroup(TenantId tenantId, UUID locationId, String name, int minSelection,
                                  int maxSelection, List<ModifierInput> modifiers) {
    if (maxSelection < minSelection) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "maximo menor que minimo");
    }
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into modifier_groups(id, tenant_id, location_id, name, min_selection, max_selection)
          values (?, ?, ?, ?, ?, ?)
          """, id, tenantId.value(), locationId, name, minSelection, maxSelection);
      for (var modifier : modifiers) {
        jdbc.update("""
            insert into modifiers(id, tenant_id, location_id, modifier_group_id, name,
                                   additional_price_pesos)
            values (?, ?, ?, ?, ?, ?)
            """, UUID.randomUUID(), tenantId.value(), locationId, id, modifier.name(),
            modifier.additionalPricePesos());
      }
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El grupo o modificador ya existe");
    }
    bumpVersion(tenantId, locationId);
    return id;
  }

  public void updateCategory(TenantId tenantId, UUID locationId, UUID categoryId, String name,
                             Integer sortOrder, Boolean active) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update categories
        set name = coalesce(?, name), sort_order = coalesce(?, sort_order),
            active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name, sortOrder, active, categoryId, tenantId.value(), locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria no encontrada");
    }
    bumpVersion(tenantId, locationId);
  }

  public void updateModifierGroup(TenantId tenantId, UUID locationId, UUID groupId, String name,
                                  Boolean active) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update modifier_groups
        set name = coalesce(?, name), active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name, active, groupId, tenantId.value(), locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Grupo de modificadores no encontrado");
    }
    bumpVersion(tenantId, locationId);
  }

  private void bumpVersion(TenantId tenantId, UUID locationId) {
    jdbc.update("""
        update locations set catalog_version = catalog_version + 1
        where id = ? and tenant_id = ?
        """, locationId, tenantId.value());
  }

  public record ModifierInput(String name, long additionalPricePesos) {
  }
}
