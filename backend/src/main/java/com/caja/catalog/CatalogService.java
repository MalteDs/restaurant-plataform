package com.caja.catalog;

import com.caja.catalog.CatalogSnapshot.AddonView;
import com.caja.catalog.CatalogSnapshot.CategoryView;
import com.caja.catalog.CatalogSnapshot.ComponentView;
import com.caja.catalog.CatalogSnapshot.DayPriceView;
import com.caja.catalog.CatalogSnapshot.IngredientView;
import com.caja.catalog.CatalogSnapshot.ModifierGroupView;
import com.caja.catalog.CatalogSnapshot.ModifierView;
import com.caja.catalog.CatalogSnapshot.ProductView;
import com.caja.catalog.CatalogSnapshot.RecipeItemView;
import com.caja.audit.AuditService;
import com.caja.shared.tenant.TenantId;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
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
    return snapshot(tenantId, locationId, false).products();
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public CatalogSnapshot snapshot(TenantId tenantId, UUID locationId, boolean includeInactive) {
    var version = jdbc.query("""
        select catalog_version from locations where id = ? and tenant_id = ?
        """, (rs, rowNum) -> rs.getLong("catalog_version"), locationId, tenantId.value())
        .stream().findFirst().orElse(0L);

    var categories = jdbc.query("""
        select id, name, sort_order, active
        from categories
        where tenant_id = ? and location_id = ? and (? or active)
        order by sort_order, name
        """, (rs, rowNum) -> new CategoryView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("sort_order"),
        rs.getBoolean("active")), tenantId.value(), locationId, includeInactive);

    var products = jdbc.query("""
        select p.id, p.tenant_id, p.location_id, p.category_id,
               coalesce(c.name, '') as category_name, p.kind, p.name, p.price_pesos, p.cost_pesos,
               p.sort_order, p.active, p.sale_days
        from products p
        left join categories c
          on c.id = p.category_id and c.tenant_id = p.tenant_id and c.location_id = p.location_id
        where p.tenant_id = ? and p.location_id = ? and (? or p.active)
        order by p.sort_order, p.name
        """, (rs, rowNum) -> new ProductView(
        rs.getObject("id", UUID.class), rs.getObject("tenant_id", UUID.class),
        rs.getObject("location_id", UUID.class), rs.getObject("category_id", UUID.class),
        rs.getString("category_name"), rs.getString("kind"),
        rs.getString("name"), rs.getLong("price_pesos"),
        (Long) rs.getObject("cost_pesos"), rs.getInt("sort_order"), rs.getBoolean("active"),
        new ArrayList<>(), new ArrayList<>(), parseSaleDays(rs.getString("sale_days")),
        new ArrayList<>(), new ArrayList<>(), new ArrayList<>()),
        tenantId.value(), locationId, includeInactive);

    var groups = jdbc.query("""
        select id, name, min_selection, max_selection, active
        from modifier_groups
        where tenant_id = ? and location_id = ? and (? or active)
        order by name
        """, (rs, rowNum) -> new ModifierGroupView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("min_selection"),
        rs.getInt("max_selection"), rs.getBoolean("active"), new ArrayList<>()),
        tenantId.value(), locationId, includeInactive);

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

    var productAddons = new LinkedHashMap<UUID, List<UUID>>();
    jdbc.query("""
        select product_id, addon_id from product_addons
        where tenant_id = ? and location_id = ?
        """, (RowCallbackHandler) rs -> productAddons
        .computeIfAbsent(rs.getObject("product_id", UUID.class), key -> new ArrayList<>())
        .add(rs.getObject("addon_id", UUID.class)), tenantId.value(), locationId);

    var dayPricesByProduct = new LinkedHashMap<UUID, List<DayPriceView>>();
    jdbc.query("""
        select product_id, weekday, price_pesos from product_day_prices
        where tenant_id = ? and location_id = ?
        order by weekday
        """, (RowCallbackHandler) rs -> dayPricesByProduct
        .computeIfAbsent(rs.getObject("product_id", UUID.class), key -> new ArrayList<>())
        .add(new DayPriceView(rs.getInt("weekday"), rs.getLong("price_pesos"))),
        tenantId.value(), locationId);

    var productRecipes = new LinkedHashMap<UUID, List<RecipeItemView>>();
    jdbc.query("""
        select product_id, ingredient_id, quantity from recipe_items
        where tenant_id = ? and location_id = ? and product_id is not null
        order by ingredient_id
        """, (RowCallbackHandler) rs -> productRecipes
        .computeIfAbsent(rs.getObject("product_id", UUID.class), key -> new ArrayList<>())
        .add(new RecipeItemView(rs.getObject("ingredient_id", UUID.class),
            rs.getBigDecimal("quantity"))), tenantId.value(), locationId);

    var addons = jdbc.query("""
        select id, name, price_pesos, active
        from addons
        where tenant_id = ? and location_id = ? and (? or active)
        order by name
        """, (rs, rowNum) -> new AddonView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getLong("price_pesos"),
        rs.getBoolean("active"), new ArrayList<>()), tenantId.value(), locationId, includeInactive);

    var addonRecipes = new LinkedHashMap<UUID, List<RecipeItemView>>();
    jdbc.query("""
        select addon_id, ingredient_id, quantity
        from recipe_items
        where tenant_id = ? and location_id = ? and addon_id is not null
        order by ingredient_id
        """, (RowCallbackHandler) rs -> addonRecipes
        .computeIfAbsent(rs.getObject("addon_id", UUID.class), key -> new ArrayList<>())
        .add(new RecipeItemView(rs.getObject("ingredient_id", UUID.class),
            rs.getBigDecimal("quantity"))), tenantId.value(), locationId);

    var ingredients = jdbc.query("""
        select id, name, unit, waste_percent, active
        from ingredients
        where tenant_id = ? and location_id = ? and (? or active)
        order by name
        """, (rs, rowNum) -> new IngredientView(
        rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("unit"),
        rs.getBigDecimal("waste_percent"), rs.getBoolean("active")),
        tenantId.value(), locationId, includeInactive);

    var productsById = new LinkedHashMap<UUID, ProductView>();
    for (var product : products) {
      product.modifierGroupIds().addAll(groupsByProduct.getOrDefault(product.id(), List.of()));
      product.components().addAll(componentsByProduct.getOrDefault(product.id(), List.of()));
      product.addonIds().addAll(productAddons.getOrDefault(product.id(), List.of()));
      product.dayPrices().addAll(dayPricesByProduct.getOrDefault(product.id(), List.of()));
      product.recipe().addAll(productRecipes.getOrDefault(product.id(), List.of()));
      productsById.put(product.id(), product);
    }
    for (var group : groups) {
      group.modifiers().addAll(modifiersByGroup.getOrDefault(group.id(), List.of()));
    }
    for (var addon : addons) {
      addon.recipe().addAll(addonRecipes.getOrDefault(addon.id(), List.of()));
    }

    return new CatalogSnapshot(version, categories, products, groups, addons, ingredients);
  }

  @Transactional
  public UUID createProduct(TenantId tenantId, UUID locationId, ProductInput input) {
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into products(id, tenant_id, location_id, category_id, kind, name, price_pesos,
                               cost_pesos, sale_days)
          values (?, ?, ?, ?, ?::product_kind, ?, ?, ?, ?)
          """, id, tenantId.value(), locationId, input.categoryId(), input.kind(), input.name(),
          input.pricePesos(), input.costPesos(), formatSaleDays(input.saleDays()));
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El producto ya existe o es invalido");
    }
    if (input.modifierGroupIds() != null && !input.modifierGroupIds().isEmpty()) {
      replaceModifierGroups(tenantId, locationId, id, input.modifierGroupIds());
    }
    if (input.addonIds() != null) {
      replaceAddons(tenantId, locationId, id, input.addonIds());
    }
    if (input.dayPrices() != null) {
      replaceDayPrices(tenantId, locationId, id, input.dayPrices());
    }
    if (input.components() != null) {
      replaceComponents(tenantId, locationId, id, input.kind(), input.components());
    }
    if (input.recipe() != null) {
      if ("COMBO".equals(input.kind()) && !input.recipe().isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Un combo no lleva receta propia");
      }
      replaceRecipe(tenantId, locationId, id, null, input.recipe());
    }
    bumpVersion(tenantId, locationId);
    audit.record(tenantId.value(), locationId, null, "CATALOG_PRODUCT_CREATED", "product", id,
        Map.of("name", input.name(), "pricePesos", input.pricePesos()));
    return id;
  }

  @Transactional
  public void updateProduct(TenantId tenantId, UUID locationId, UUID productId,
                            ProductUpdateInput input) {
    if (input.name() != null && input.name().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var kind = jdbc.query("""
        select kind from products where id = ? and tenant_id = ? and location_id = ?
        """, (rs, rowNum) -> rs.getString("kind"), productId, tenantId.value(), locationId)
        .stream().findFirst().orElseThrow(() -> new ResponseStatusException(
            HttpStatus.NOT_FOUND, "Producto no encontrado"));
    var updated = jdbc.update("""
        update products
        set name = coalesce(?, name), category_id = coalesce(?, category_id),
            price_pesos = coalesce(?, price_pesos), cost_pesos = coalesce(?, cost_pesos),
            active = coalesce(?, active),
            sale_days = case when ? then ? else sale_days end,
            updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, input.name(), input.categoryId(), input.pricePesos(), input.costPesos(),
        input.active(), input.saleDays() != null, formatSaleDays(input.saleDays()), productId,
        tenantId.value(), locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Producto no encontrado");
    }
    if (input.modifierGroupIds() != null) {
      replaceModifierGroups(tenantId, locationId, productId, input.modifierGroupIds());
    }
    if (input.addonIds() != null) {
      replaceAddons(tenantId, locationId, productId, input.addonIds());
    }
    if (input.dayPrices() != null) {
      replaceDayPrices(tenantId, locationId, productId, input.dayPrices());
    }
    if (input.components() != null) {
      replaceComponents(tenantId, locationId, productId, kind, input.components());
    }
    if (input.recipe() != null) {
      if ("COMBO".equals(kind) && !input.recipe().isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Un combo no lleva receta propia");
      }
      replaceRecipe(tenantId, locationId, productId, null, input.recipe());
    }
    bumpVersion(tenantId, locationId);
  }

  private void replaceAddons(TenantId tenantId, UUID locationId, UUID productId,
                             List<UUID> addonIds) {
    jdbc.update("""
        delete from product_addons
        where product_id = ? and tenant_id = ? and location_id = ?
        """, productId, tenantId.value(), locationId);
    for (var addonId : addonIds) {
      var exists = jdbc.queryForObject("""
          select count(*) from addons
          where id = ? and tenant_id = ? and location_id = ?
          """, Integer.class, addonId, tenantId.value(), locationId);
      if (exists == null || exists == 0) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Adicional invalido");
      }
      jdbc.update("""
          insert into product_addons(product_id, addon_id, tenant_id, location_id)
          values (?, ?, ?, ?)
          """, productId, addonId, tenantId.value(), locationId);
    }
  }

  private void replaceDayPrices(TenantId tenantId, UUID locationId, UUID productId,
                                List<DayPriceInput> dayPrices) {
    jdbc.update("""
        delete from product_day_prices
        where product_id = ? and tenant_id = ? and location_id = ?
        """, productId, tenantId.value(), locationId);
    var seen = new HashSet<Integer>();
    for (var dayPrice : dayPrices) {
      if (dayPrice.weekday() < 1 || dayPrice.weekday() > 7 || !seen.add(dayPrice.weekday())) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dia de precio invalido");
      }
      if (dayPrice.pricePesos() < 0) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Precio de dia invalido");
      }
      jdbc.update("""
          insert into product_day_prices(product_id, weekday, price_pesos, tenant_id, location_id)
          values (?, ?, ?, ?, ?)
          """, productId, dayPrice.weekday(), dayPrice.pricePesos(), tenantId.value(), locationId);
    }
  }

  private void replaceComponents(TenantId tenantId, UUID locationId, UUID productId, String kind,
                                 List<ComponentInput> components) {
    if (!"COMBO".equals(kind)) {
      if (!components.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Solo un combo puede tener componentes");
      }
      return;
    }
    if (components.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "El combo necesita al menos un componente");
    }
    jdbc.update("""
        delete from combo_components
        where combo_product_id = ? and tenant_id = ? and location_id = ?
        """, productId, tenantId.value(), locationId);
    for (var component : components) {
      if (component.productId().equals(productId) || component.quantity() < 1) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Componente invalido");
      }
      var componentKind = jdbc.query("""
          select kind from products
          where id = ? and tenant_id = ? and location_id = ?
          """, (rs, rowNum) -> rs.getString("kind"), component.productId(), tenantId.value(),
          locationId).stream().findFirst().orElse(null);
      if (!"PRODUCT".equals(componentKind)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "El componente debe ser un producto");
      }
      jdbc.update("""
          insert into combo_components(combo_product_id, component_product_id, quantity,
                                      tenant_id, location_id)
          values (?, ?, ?, ?, ?)
          """, productId, component.productId(), component.quantity(), tenantId.value(), locationId);
    }
  }

  private void replaceModifierGroups(TenantId tenantId, UUID locationId, UUID productId,
                                     List<UUID> groupIds) {
    jdbc.update("""
        delete from product_modifier_groups
        where product_id = ? and tenant_id = ? and location_id = ?
        """, productId, tenantId.value(), locationId);
    for (var groupId : groupIds) {
      var exists = jdbc.queryForObject("""
          select count(*) from modifier_groups
          where id = ? and tenant_id = ? and location_id = ?
          """, Integer.class, groupId, tenantId.value(), locationId);
      if (exists == null || exists == 0) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Grupo de modificadores invalido");
      }
      jdbc.update("""
          insert into product_modifier_groups(product_id, modifier_group_id, tenant_id, location_id)
          values (?, ?, ?, ?)
          """, productId, groupId, tenantId.value(), locationId);
    }
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

  @Transactional
  public UUID createAddon(TenantId tenantId, UUID locationId, String name, long pricePesos,
                          Boolean active, List<RecipeItemInput> recipe) {
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into addons(id, tenant_id, location_id, name, price_pesos, active)
          values (?, ?, ?, ?, ?, ?)
          """, id, tenantId.value(), locationId, name, pricePesos, active == null || active);
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "El adicional ya existe o es invalido");
    }
    replaceRecipe(tenantId, locationId, null, id, recipe);
    bumpVersion(tenantId, locationId);
    audit.record(tenantId.value(), locationId, null, "CATALOG_ADDON_CREATED", "addon", id,
        Map.of("name", name, "pricePesos", pricePesos));
    return id;
  }

  @Transactional
  public void updateAddon(TenantId tenantId, UUID locationId, UUID addonId, String name,
                          Long pricePesos, Boolean active, List<RecipeItemInput> recipe) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update addons
        set name = coalesce(?, name), price_pesos = coalesce(?, price_pesos),
            active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name, pricePesos, active, addonId, tenantId.value(), locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Adicional no encontrado");
    }
    replaceRecipe(tenantId, locationId, null, addonId, recipe);
    bumpVersion(tenantId, locationId);
  }

  @Transactional
  public UUID createIngredient(TenantId tenantId, UUID locationId, String name, String unit,
                               BigDecimal wastePercent) {
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into ingredients(id, tenant_id, location_id, name, unit, waste_percent)
          values (?, ?, ?, ?, ?::ingredient_unit, ?)
          """, id, tenantId.value(), locationId, name, unit,
          wastePercent == null ? BigDecimal.ZERO : wastePercent);
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT,
          "El ingrediente ya existe o es invalido");
    }
    bumpVersion(tenantId, locationId);
    audit.record(tenantId.value(), locationId, null, "CATALOG_INGREDIENT_CREATED", "ingredient",
        id, Map.of("name", name, "unit", unit));
    return id;
  }

  @Transactional
  public void updateIngredient(TenantId tenantId, UUID locationId, UUID ingredientId, String name,
                               String unit, BigDecimal wastePercent, Boolean active) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update ingredients
        set name = coalesce(?, name), unit = coalesce(?::ingredient_unit, unit),
            waste_percent = coalesce(?, waste_percent), active = coalesce(?, active),
            updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name, unit, wastePercent, active, ingredientId, tenantId.value(), locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingrediente no encontrado");
    }
    bumpVersion(tenantId, locationId);
  }

  private void replaceRecipe(TenantId tenantId, UUID locationId, UUID productId, UUID addonId,
                             List<RecipeItemInput> recipe) {
    if (recipe == null) {
      return;
    }
    if (productId != null) {
      jdbc.update("""
          delete from recipe_items
          where product_id = ? and tenant_id = ? and location_id = ?
          """, productId, tenantId.value(), locationId);
    } else {
      jdbc.update("""
          delete from recipe_items
          where addon_id = ? and tenant_id = ? and location_id = ?
          """, addonId, tenantId.value(), locationId);
    }
    var seen = new HashSet<UUID>();
    for (var item : recipe) {
      if (item.quantity() == null || item.quantity().signum() <= 0) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "La cantidad del ingrediente debe ser mayor que cero");
      }
      if (!seen.add(item.ingredientId())) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "El ingrediente esta repetido en la receta");
      }
      var exists = jdbc.queryForObject("""
          select count(*) from ingredients
          where id = ? and tenant_id = ? and location_id = ?
          """, Integer.class, item.ingredientId(), tenantId.value(), locationId);
      if (exists == null || exists == 0) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ingrediente invalido");
      }
      jdbc.update("""
          insert into recipe_items(id, tenant_id, location_id, product_id, addon_id,
                                  ingredient_id, quantity)
          values (?, ?, ?, ?, ?, ?, ?)
          """, UUID.randomUUID(), tenantId.value(), locationId, productId, addonId,
          item.ingredientId(), item.quantity());
    }
  }

  private void bumpVersion(TenantId tenantId, UUID locationId) {
    jdbc.update("""
        update locations set catalog_version = catalog_version + 1
        where id = ? and tenant_id = ?
        """, locationId, tenantId.value());
  }

  private static List<Integer> parseSaleDays(String raw) {
    if (raw == null || raw.isBlank()) {
      return List.of();
    }
    return Arrays.stream(raw.split(","))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .map(Integer::valueOf)
        .toList();
  }

  private static String formatSaleDays(List<Integer> saleDays) {
    if (saleDays == null || saleDays.isEmpty()) {
      return null;
    }
    return saleDays.stream()
        .distinct()
        .sorted()
        .map(String::valueOf)
        .collect(Collectors.joining(","));
  }

  public record ModifierInput(String name, long additionalPricePesos) {
  }

  public record RecipeItemInput(UUID ingredientId, BigDecimal quantity) {
  }

  public record DayPriceInput(int weekday, long pricePesos) {
  }

  public record ComponentInput(UUID productId, int quantity) {
  }

  public record ProductInput(String name, UUID categoryId, long pricePesos, Long costPesos,
                             String kind, List<Integer> saleDays, List<UUID> modifierGroupIds,
                             List<UUID> addonIds, List<DayPriceInput> dayPrices,
                             List<RecipeItemInput> recipe, List<ComponentInput> components) {
  }

  public record ProductUpdateInput(String name, UUID categoryId, Long pricePesos, Long costPesos,
                                   Boolean active, List<Integer> saleDays,
                                   List<UUID> modifierGroupIds, List<UUID> addonIds,
                                   List<DayPriceInput> dayPrices, List<RecipeItemInput> recipe,
                                   List<ComponentInput> components) {
  }
}
