package com.caja.sales;

import com.caja.payments.PaymentMethod;
import com.caja.shifts.RefundCommand;
import com.caja.shifts.ShiftApplicationService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Testcontainers
class SaleApplicationIT {
  @Container @ServiceConnection
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @Autowired SaleApplicationService sales;
  @Autowired ShiftApplicationService shifts;
  @Autowired JdbcTemplate jdbc;

  @Test void keepsPricesFrozenByTheTillEvenIfCatalogChanged() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);

    var applied = sales.apply(saleCommand(ctx, product, 16500, 2, "CASH"));

    assertEquals(33000, applied.totalPesos());
    assertEquals("ALM-A-000001", applied.displayCode());
    jdbc.update("update products set price_pesos = 20000 where id = ?", product);
    assertEquals(33000, sales.find(applied.id()).totalPesos());
    assertEquals("CAJA", jdbc.queryForObject("select source from orders where sale_id = ?",
        String.class, applied.id()));
    assertEquals(1, jdbc.queryForObject("select count(*) from order_items where order_id = "
        + "(select id from orders where sale_id = ?)", Integer.class, applied.id()));
  }

  @Test void chargesTheTotalAndFreezesTheModifiers() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);
    var modifier = insertModifier(ctx, "Bacon", 2000);

    var applied = sales.apply(saleCommand(ctx, product, 16500, 2, "CARD",
        new CreateSaleCommand.ModifierCommand(modifier, "Bacon", 2000)));

    // 2 x (16500 + 2000) = 37000
    assertEquals(37000, applied.totalPesos());
    assertEquals(37000, jdbc.queryForObject(
        "select amount_pesos from payments where sale_id = ?", Long.class, applied.id()));
    assertEquals(37000, jdbc.queryForObject(
        "select line_total_pesos from sale_items where sale_id = ?", Long.class, applied.id()));
    assertEquals("Bacon", jdbc.queryForObject(
        "select modifier_name from sale_item_modifiers where sale_item_id = "
            + "(select id from sale_items where sale_id = ?)", String.class, applied.id()));
  }

  @Test void deliveryFeeAndTableLabelAreStored() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);

    var delivery = sales.apply(saleCommand(ctx, product, 16500, 1, "CASH")
        .withType(SaleType.DELIVERY)
        .withDeliveryFee(5000));
    assertEquals(21500, delivery.totalPesos());
    assertEquals(5000, jdbc.queryForObject("select delivery_fee_pesos from sales where id = ?",
        Long.class, delivery.id()));

    var dineIn = sales.apply(saleCommand(ctx, product, 16500, 1, "CASH")
        .withType(SaleType.DINE_IN)
        .withTableLabel("Mesa 4"));
    assertEquals("Mesa 4", jdbc.queryForObject("select table_label from sales where id = ?",
        String.class, dineIn.id()));
  }

  @Test void rejectsASaleWithoutAnOpenShift() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);
    jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());

    assertThrows(IllegalStateException.class,
        () -> sales.apply(saleCommand(ctx, product, 16500, 1, "CASH")));
    assertEquals(0, jdbc.queryForObject("select count(*) from sales where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void shiftExpectedCashMatchesSalesAndRefunds() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);
    var sale = sales.apply(saleCommand(ctx, product, 16500, 1, "CASH"));

    assertEquals(66500, shifts.expectedCash(ctx.shiftId()));

    var refund = shifts.applyRefund(new RefundCommand(ctx.tenantId(), ctx.locationId(),
        ctx.deviceId(), ctx.userId(), ctx.shiftId(), sale.id(), "CASH", "cobro equivocado",
        Instant.now()));

    assertEquals(50000, shifts.expectedCash(ctx.shiftId()));
    assertEquals(sale.id(), refund.saleId());
    assertEquals(16500, refund.amountPesos());
    assertEquals("REFUNDED", jdbc.queryForObject("select status from sales where id = ?",
        String.class, sale.id()));
    assertEquals("REFUNDED", jdbc.queryForObject(
        "select status from orders where sale_id = ?", String.class, sale.id()));
  }

  @Test void rejectsASecondRefundOfTheSameSale() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);
    var sale = sales.apply(saleCommand(ctx, product, 16500, 1, "CASH"));
    var refund = new RefundCommand(ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(),
        ctx.shiftId(), sale.id(), "CASH", "cobro equivocado", Instant.now());
    shifts.applyRefund(refund);

    assertThrows(IllegalStateException.class, () -> shifts.applyRefund(refund));
    assertEquals(1, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
        Integer.class, ctx.tenantId()));
  }

  @Test void refundInANewShiftDoesNotChangeTheClosedShift() {
    var ctx = fixture();
    var product = insertProduct(ctx, 16500);
    var sale = sales.apply(saleCommand(ctx, product, 16500, 1, "CASH"));
    shifts.close(new com.caja.shifts.CloseShiftCommand(ctx.tenantId(), ctx.locationId(),
        ctx.shiftId(), 66500));

    var secondShift = UUID.randomUUID();
    jdbc.update("insert into shifts(id, tenant_id, location_id, device_id, user_id, "
        + "opening_cash_pesos, operational_date) values (?, ?, ?, ?, ?, 0, current_date)",
        secondShift, ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId());
    shifts.applyRefund(new com.caja.shifts.RefundCommand(ctx.tenantId(), ctx.locationId(),
        ctx.deviceId(), ctx.userId(), secondShift, sale.id(), "CASH", "turno siguiente",
        Instant.now()));

    // The refund belongs to the second shift, so the closed shift keeps its arqueo.
    assertEquals(66500, shifts.expectedCash(ctx.shiftId()));
    assertEquals(-16500, shifts.expectedCash(secondShift));
  }

  private record Ctx(UUID tenantId, UUID locationId, UUID userId, UUID deviceId, UUID shiftId,
                     AtomicInteger seq) {
    String nextDisplayCode() {
      return "ALM-A-" + String.format("%06d", seq.incrementAndGet());
    }
  }

  private Ctx fixture() {
    var tenantId = UUID.randomUUID();
    var locationId = UUID.randomUUID();
    var userId = UUID.randomUUID();
    var deviceId = UUID.randomUUID();
    jdbc.update("insert into tenants(id, name) values (?, ?)", tenantId, "Karbon");
    jdbc.update("insert into locations(id, tenant_id, code, name) values (?, ?, 'ALM', 'Almendros')",
        locationId, tenantId);
    jdbc.update("insert into users(id, tenant_id, location_id, username, password_hash, role) "
        + "values (?, ?, ?, 'cajero', 'hash', 'CASHIER')", userId, tenantId, locationId);
    jdbc.update("insert into devices(id, tenant_id, location_id, code, name, token_hash, status) "
        + "values (?, ?, ?, 'A', 'Caja A', 'hash', 'ACTIVE')", deviceId, tenantId, locationId);
    var shiftId = UUID.randomUUID();
    jdbc.update("insert into shifts(id, tenant_id, location_id, device_id, user_id, "
        + "opening_cash_pesos, operational_date) values (?, ?, ?, ?, ?, 50000, current_date)",
        shiftId, tenantId, locationId, deviceId, userId);
    return new Ctx(tenantId, locationId, userId, deviceId, shiftId, new AtomicInteger());
  }

  private UUID insertProduct(Ctx ctx, long pricePesos) {
    var productId = UUID.randomUUID();
    jdbc.update("insert into products(id, tenant_id, location_id, kind, name, price_pesos) "
        + "values (?, ?, ?, 'PRODUCT', 'Producto', ?)", productId, ctx.tenantId(), ctx.locationId(),
        pricePesos);
    return productId;
  }

  private UUID insertModifier(Ctx ctx, String name, long pricePesos) {
    var groupId = UUID.randomUUID();
    var modifierId = UUID.randomUUID();
    jdbc.update("insert into modifier_groups(id, tenant_id, location_id, name) "
        + "values (?, ?, ?, 'Extras')", groupId, ctx.tenantId(), ctx.locationId());
    jdbc.update("insert into modifiers(id, tenant_id, location_id, modifier_group_id, name, "
        + "additional_price_pesos) values (?, ?, ?, ?, ?, ?)", modifierId, ctx.tenantId(),
        ctx.locationId(), groupId, name, pricePesos);
    return modifierId;
  }

  private CreateSaleCommand saleCommand(Ctx ctx, UUID productId, long unitPrice, int quantity,
                                        String method,
                                        CreateSaleCommand.ModifierCommand... modifiers) {
    var items = List.of(new CreateSaleCommand.ItemCommand(productId, "Producto", "HAMBURGUESAS",
        quantity, unitPrice, null, null, List.of(modifiers), List.of()));
    return new CreateSaleCommand(java.util.UUID.randomUUID(), ctx.tenantId(), ctx.locationId(),
        ctx.deviceId(), ctx.userId(),
        ctx.shiftId(), SaleType.COUNTER, null, 0, items, PaymentMethod.valueOf(method),
        UUID.randomUUID(), ctx.nextDisplayCode(), ctx.seq().get(), Instant.now());
  }
}
