package com.caja.sales;

import com.caja.audit.AuditService;
import com.caja.orders.OrderFactory;
import com.caja.payments.PaymentService;
import java.sql.Timestamp;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaleApplicationService {
  private static final ZoneId OPERATING_ZONE = ZoneId.of("America/Bogota");

  private final JdbcTemplate jdbc;
  private final PaymentService payments;
  private final OrderFactory orders;
  private final AuditService audit;

  public SaleApplicationService(JdbcTemplate jdbc, PaymentService payments, OrderFactory orders,
                                AuditService audit) {
    this.jdbc = jdbc;
    this.payments = payments;
    this.orders = orders;
    this.audit = audit;
  }

  @Transactional
  public AppliedSale apply(CreateSaleCommand command) {
    var existing = querySale(command.tenantId(), command.locationId(), command.saleId());
    if (existing != null) {
      return existing;
    }
    requireOpenShift(command);
    var total = command.totalPesos();
    validatePayments(command, total);
    validateOverrides(command);
    var saleId = command.saleId();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          table_label, delivery_fee_pesos, total_pesos, display_code, device_seq,
                          operational_date, client_created_at, server_received_at)
        values (?, ?, ?, ?, ?, ?, ?::sale_type, ?, ?, ?, ?, ?, ?, ?, now())
        """, saleId, command.tenantId(), command.locationId(), command.deviceId(), command.userId(),
        command.shiftId(), command.type().name(), command.tableLabel(), command.deliveryFeePesos(),
        total, command.displayCode(), command.deviceSeq(),
        command.clientCreatedAt().atZone(OPERATING_ZONE).toLocalDate(),
        Timestamp.from(command.clientCreatedAt()));

    for (var item : command.items()) {
      insertItem(command, saleId, item);
    }
    for (var payment : command.payments()) {
      payments.charge(command.tenantId(), command.locationId(), saleId, payment.method(),
          payment.amountPesos());
    }
    orders.fromSale(command, saleId, total);
    return new AppliedSale(saleId, command.shiftId(), command.type(), command.displayCode(), total,
        command.deliveryFeePesos());
  }

  public AppliedSale find(UUID tenantId, UUID locationId, UUID saleId) {
    var found = querySale(tenantId, locationId, saleId);
    if (found == null) {
      throw new IllegalStateException("Venta no encontrada");
    }
    return found;
  }

  private AppliedSale querySale(UUID tenantId, UUID locationId, UUID saleId) {
    return jdbc.query("""
        select id, shift_id, type, display_code, total_pesos, delivery_fee_pesos
        from sales
        where id = ? and tenant_id = ? and location_id = ?
        """, (rs, rowNum) -> new AppliedSale(
        rs.getObject("id", UUID.class), rs.getObject("shift_id", UUID.class),
        SaleType.valueOf(rs.getString("type")), rs.getString("display_code"),
        rs.getLong("total_pesos"), rs.getLong("delivery_fee_pesos")), saleId, tenantId,
        locationId).stream().findFirst().orElse(null);
  }

  private void requireOpenShift(CreateSaleCommand command) {
    var open = jdbc.queryForObject("""
        select count(*) from shifts
        where id = ? and tenant_id = ? and location_id = ? and device_id = ? and closed_at is null
        """, Integer.class, command.shiftId(), command.tenantId(), command.locationId(),
        command.deviceId());
    if (open == null || open == 0) {
      throw new IllegalStateException("No hay turno abierto para este dispositivo");
    }
  }

  private long totalOf(CreateSaleCommand command) {
    var items = command.items().stream().mapToLong(this::lineTotal).sum();
    return items + command.deliveryFeePesos();
  }

  private long lineTotal(CreateSaleCommand.ItemCommand item) {
    return CreateSaleCommand.lineTotal(item);
  }

  private void validatePayments(CreateSaleCommand command, long total) {
    var lines = command.payments();
    if (lines == null || lines.isEmpty()) {
      throw new IllegalArgumentException("La venta necesita al menos un pago");
    }
    long sum = 0;
    for (var line : lines) {
      if (line.amountPesos() < 0 || (total > 0 && line.amountPesos() == 0)) {
        throw new IllegalArgumentException("Cada pago debe ser mayor que cero");
      }
      sum += line.amountPesos();
    }
    if (sum != total) {
      throw new IllegalArgumentException("Los pagos no suman el total de la venta");
    }
  }

  private void insertItem(CreateSaleCommand command, UUID saleId,
                           CreateSaleCommand.ItemCommand item) {
    var itemId = UUID.randomUUID();
    var override = item.unitPricePesos() != item.catalogUnitPricePesos();
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, cost_pesos, note,
                               line_total_pesos, catalog_unit_price_pesos, override_reason,
                               override_user_id)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, itemId, command.tenantId(), command.locationId(), saleId, item.productId(),
        item.productName(), item.categoryName(), item.quantity(), item.unitPricePesos(),
        item.costPesos(), item.note(), lineTotal(item), item.catalogUnitPricePesos(),
        override ? item.overrideReason() : null, override ? command.userId() : null);

    for (var modifier : item.modifiers()) {
      jdbc.update("""
          insert into sale_item_modifiers(sale_item_id, modifier_id, modifier_name,
                                         additional_price_pesos, tenant_id, location_id)
          values (?, ?, ?, ?, ?, ?)
          """, itemId, modifier.modifierId(), modifier.modifierName(),
          modifier.additionalPricePesos(), command.tenantId(), command.locationId());
    }
    for (var component : item.components()) {
      jdbc.update("""
          insert into sale_item_components(sale_item_id, component_product_id, component_name,
                                          quantity, tenant_id, location_id)
          values (?, ?, ?, ?, ?, ?)
          """, itemId, component.productId(), component.name(), component.quantity(),
          command.tenantId(), command.locationId());
    }
    if (override) {
      audit.record(command.tenantId(), command.locationId(), command.userId(), "PRICE_OVERRIDDEN",
          "sale_item", itemId, Map.of("catalogPricePesos", item.catalogUnitPricePesos(),
              "appliedPricePesos", item.unitPricePesos(), "reason", item.overrideReason()));
    }
  }

  private void validateOverrides(CreateSaleCommand command) {
    var overrides = command.items().stream()
        .filter(item -> item.unitPricePesos() != item.catalogUnitPricePesos())
        .map(item -> new PriceOverride(item.unitPricePesos(), item.catalogUnitPricePesos(),
            item.overrideReason()))
        .toList();
    validatePriceOverrides(command.tenantId(), command.locationId(), command.userId(), overrides);
  }

  public void validatePriceOverrides(UUID tenantId, UUID locationId, UUID userId,
                                     List<PriceOverride> overrides) {
    if (overrides == null || overrides.isEmpty()) {
      return;
    }
    var role = jdbc.query("""
        select role from users
        where id = ? and tenant_id = ? and location_id = ?
        """, (rs, rowNum) -> rs.getString("role"), userId, tenantId, locationId).stream()
        .findFirst().orElse(null);
    if (!"MANAGER".equals(role) && !"ADMIN".equals(role)) {
      throw new IllegalStateException("Solo encargado o admin puede cambiar precios");
    }
    for (var override : overrides) {
      var reason = override.reason();
      if (reason == null || reason.trim().length() < 5 || reason.length() > 200) {
        throw new IllegalStateException(
            "El cambio de precio necesita un motivo de al menos 5 caracteres");
      }
    }
  }

  public record PriceOverride(long unitPricePesos, long catalogUnitPricePesos, String reason) {
  }

  public List<AppliedSale> recent(UUID tenantId, UUID locationId, int limit) {
    return jdbc.query("""
        select id, shift_id, type, display_code, total_pesos, delivery_fee_pesos
        from sales
        where tenant_id = ? and location_id = ?
        order by created_at desc
        limit ?
        """, (rs, rowNum) -> new AppliedSale(
        rs.getObject("id", UUID.class), rs.getObject("shift_id", UUID.class),
        SaleType.valueOf(rs.getString("type")), rs.getString("display_code"),
        rs.getLong("total_pesos"), rs.getLong("delivery_fee_pesos")), tenantId, locationId, limit);
  }
}
