package com.caja.sales;

import com.caja.orders.OrderFactory;
import com.caja.payments.PaymentService;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
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

  public SaleApplicationService(JdbcTemplate jdbc, PaymentService payments, OrderFactory orders) {
    this.jdbc = jdbc;
    this.payments = payments;
    this.orders = orders;
  }

  @Transactional
  public AppliedSale apply(CreateSaleCommand command) {
    var existing = querySale(command.saleId());
    if (existing != null) {
      return existing;
    }
    requireOpenShift(command);
    var total = totalOf(command);
    var saleId = command.saleId();
    jdbc.update("""
        insert into sales(id, tenant_id, location_id, device_id, user_id, shift_id, type,
                          table_label, delivery_fee_pesos, total_pesos, display_code, device_seq,
                          operational_date, client_created_at, server_received_at)
        values (?, ?, ?, ?, ?, ?, ?::sale_type, ?, ?, ?, ?, ?, ?, ?, now())
        """, saleId, command.tenantId(), command.locationId(), command.deviceId(), command.userId(),
        command.shiftId(), command.type().name(), command.tableLabel(), command.deliveryFeePesos(),
        total, command.displayCode(), command.deviceSeq(),
        LocalDate.now(OPERATING_ZONE), Timestamp.from(command.clientCreatedAt()));

    for (var item : command.items()) {
      insertItem(command, saleId, item);
    }
    payments.charge(command.tenantId(), command.locationId(), saleId, command.method(), total);
    orders.fromSale(command, saleId, total);
    return new AppliedSale(saleId, command.shiftId(), command.type(), command.displayCode(), total,
        command.deliveryFeePesos());
  }

  public AppliedSale find(UUID saleId) {
    var found = querySale(saleId);
    if (found == null) {
      throw new IllegalStateException("Venta no encontrada");
    }
    return found;
  }

  private AppliedSale querySale(UUID saleId) {
    return jdbc.query("""
        select id, shift_id, type, display_code, total_pesos, delivery_fee_pesos
        from sales
        where id = ?
        """, (rs, rowNum) -> new AppliedSale(
        rs.getObject("id", UUID.class), rs.getObject("shift_id", UUID.class),
        SaleType.valueOf(rs.getString("type")), rs.getString("display_code"),
        rs.getLong("total_pesos"), rs.getLong("delivery_fee_pesos")), saleId)
        .stream().findFirst().orElse(null);
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
    var modifiers = item.modifiers().stream()
        .mapToLong(CreateSaleCommand.ModifierCommand::additionalPricePesos).sum();
    return (long) item.quantity() * (item.unitPricePesos() + modifiers);
  }

  private void insertItem(CreateSaleCommand command, UUID saleId,
                           CreateSaleCommand.ItemCommand item) {
    var itemId = UUID.randomUUID();
    jdbc.update("""
        insert into sale_items(id, tenant_id, location_id, sale_id, product_id, product_name,
                               category_name, quantity, unit_price_pesos, cost_pesos, note,
                               line_total_pesos)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, itemId, command.tenantId(), command.locationId(), saleId, item.productId(),
        item.productName(), item.categoryName(), item.quantity(), item.unitPricePesos(),
        item.costPesos(), item.note(), lineTotal(item));

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
