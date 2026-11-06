package com.caja.orders;

import com.caja.sales.CreateSaleCommand;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class OrderFactory {
  private final JdbcTemplate jdbc;

  public OrderFactory(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public UUID fromSale(CreateSaleCommand command, UUID saleId, long totalPesos) {
    var orderId = UUID.randomUUID();
    jdbc.update("""
        insert into orders(id, tenant_id, location_id, sale_id, source, status, operational_date)
        values (?, ?, ?, ?, 'CAJA', 'CHARGED', ?)
        """, orderId, command.tenantId(), command.locationId(), saleId,
        java.sql.Date.valueOf(java.time.LocalDate.now(java.time.ZoneId.of("America/Bogota"))));
    for (var item : command.items()) {
      jdbc.update("""
          insert into order_items(id, tenant_id, location_id, order_id, product_id, product_name,
                                  quantity, unit_price_pesos, note)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          """, UUID.randomUUID(), command.tenantId(), command.locationId(), orderId,
          item.productId(), item.productName(), item.quantity(), item.unitPricePesos(), item.note());
    }
    return orderId;
  }
}
