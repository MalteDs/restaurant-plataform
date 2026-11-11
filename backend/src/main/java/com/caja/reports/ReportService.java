package com.caja.reports;

import com.caja.reports.Summary.CategoryRow;
import com.caja.reports.Summary.DayRow;
import com.caja.reports.Summary.ExpenseCategoryRow;
import com.caja.reports.Summary.HourRow;
import com.caja.reports.Summary.IngredientRow;
import com.caja.reports.Summary.ProductRow;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportService {
  private final JdbcTemplate jdbc;

  public ReportService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional(readOnly = true)
  public Summary summary(UUID tenantId, UUID locationId, LocalDate from, LocalDate to) {
    var salesPesos = total("""
        select coalesce(sum(total_pesos), 0) from sales
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        """, tenantId, locationId, from, to);
    var orders = count("""
        select count(*) from sales
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        """, tenantId, locationId, from, to);
    var refundsPesos = total("""
        select coalesce(sum(amount_pesos), 0) from refunds
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        """, tenantId, locationId, from, to);
    var refundCount = count("""
        select count(*) from refunds
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        """, tenantId, locationId, from, to);
    var cashPesos = methodTotal(tenantId, locationId, from, to, "CASH");
    var cardPesos = methodTotal(tenantId, locationId, from, to, "CARD");
    var brebPesos = methodTotal(tenantId, locationId, from, to, "BREB");
    var expensesPesos = total("""
        select coalesce(sum(amount_pesos), 0) from expenses
        where tenant_id = ? and location_id = ? and expense_date between ? and ?
          and voided_at is null
        """, tenantId, locationId, from, to);
    var costPesos = total("""
        select coalesce(sum(coalesce(si.cost_pesos, 0) * si.quantity), 0)
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        where s.tenant_id = ? and s.location_id = ? and s.operational_date between ? and ?
          and s.status <> 'REFUNDED'
        """, tenantId, locationId, from, to);

    var netSalesPesos = salesPesos - refundsPesos;
    var averageTicket = orders == 0 ? 0 : netSalesPesos / orders;
    var profit = netSalesPesos - costPesos - expensesPesos;

    var byDay = jdbc.query("""
        select operational_date, coalesce(sum(total_pesos), 0) as total
        from sales
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        group by operational_date
        order by operational_date
        """, (rs, rowNum) -> new DayRow(rs.getDate("operational_date").toLocalDate(),
        rs.getLong("total")), tenantId, locationId, from, to);

    var byHour = jdbc.query("""
        select extract(hour from client_created_at at time zone 'America/Bogota')::int as hour,
               coalesce(sum(total_pesos), 0) as total
        from sales
        where tenant_id = ? and location_id = ? and operational_date between ? and ?
        group by hour
        order by hour
        """, (rs, rowNum) -> new HourRow(rs.getInt("hour"), rs.getLong("total")), tenantId,
        locationId, from, to);

    var byProduct = jdbc.query("""
        select si.product_name, coalesce(sum(si.quantity), 0) as quantity,
               coalesce(sum(si.line_total_pesos), 0) as total
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        where s.tenant_id = ? and s.location_id = ? and s.operational_date between ? and ?
        group by si.product_name
        order by total desc
        """, (rs, rowNum) -> new ProductRow(rs.getString("product_name"), rs.getLong("quantity"),
        rs.getLong("total")), tenantId, locationId, from, to);

    var byCategory = jdbc.query("""
        select si.category_name, coalesce(sum(si.quantity), 0) as quantity,
               coalesce(sum(si.line_total_pesos), 0) as total
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        where s.tenant_id = ? and s.location_id = ? and s.operational_date between ? and ?
        group by si.category_name
        order by total desc
        """, (rs, rowNum) -> new CategoryRow(rs.getString("category_name"),
        rs.getLong("quantity"), rs.getLong("total")), tenantId, locationId, from, to);

    var byExpenseCategory = jdbc.query("""
        select category, coalesce(sum(amount_pesos), 0) as total
        from expenses
        where tenant_id = ? and location_id = ? and expense_date between ? and ?
          and voided_at is null
        group by category
        order by total desc
        """, (rs, rowNum) -> new ExpenseCategoryRow(rs.getString("category"),
        rs.getLong("total")), tenantId, locationId, from, to);

    var byIngredient = jdbc.query("""
        with usages as (
          select ri.ingredient_id, si.quantity * ri.quantity as qty
          from sale_items si
          join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                       and s.location_id = si.location_id
          join recipe_items ri on ri.product_id = si.product_id
                              and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
          where s.tenant_id = ? and s.location_id = ?
            and s.operational_date between ? and ? and s.status <> 'REFUNDED'
            and not exists (
              select 1 from sale_item_components c
              where c.sale_item_id = si.id and c.tenant_id = si.tenant_id
                and c.location_id = si.location_id
            )
          union all
          select ri.ingredient_id, si.quantity * c.quantity * ri.quantity
          from sale_items si
          join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                       and s.location_id = si.location_id
          join sale_item_components c on c.sale_item_id = si.id
          join recipe_items ri on ri.product_id = c.component_product_id
                              and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
          where s.tenant_id = ? and s.location_id = ?
            and s.operational_date between ? and ? and s.status <> 'REFUNDED'
          union all
          select ri.ingredient_id, si.quantity * a.quantity * ri.quantity
          from sale_items si
          join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                       and s.location_id = si.location_id
          join sale_item_addons a on a.sale_item_id = si.id
          join recipe_items ri on ri.addon_id = a.addon_id
                              and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
          where s.tenant_id = ? and s.location_id = ?
            and s.operational_date between ? and ? and s.status <> 'REFUNDED'
        )
        select i.name, i.unit,
               sum(u.qty) * (1 + i.waste_percent / 100) as quantity,
               i.waste_percent
        from usages u
        join ingredients i on i.id = u.ingredient_id
                          and i.tenant_id = ? and i.location_id = ?
        group by i.id, i.name, i.unit, i.waste_percent
        order by i.name
        """, (rs, rowNum) -> new IngredientRow(rs.getString("name"), rs.getString("unit"),
        rs.getBigDecimal("quantity"), rs.getBigDecimal("waste_percent")),
        tenantId, locationId, from, to, tenantId, locationId, from, to, tenantId, locationId,
        from, to, tenantId, locationId);

    var productUnits = jdbc.queryForMap("""
        select coalesce(sum(si.quantity), 0) as total,
               coalesce(sum(case
                 when exists (
                   select 1 from sale_item_components c
                   where c.sale_item_id = si.id and c.tenant_id = si.tenant_id
                     and c.location_id = si.location_id
                 ) then case when not exists (
                   select 1 from sale_item_components c
                   where c.sale_item_id = si.id and c.tenant_id = si.tenant_id
                     and c.location_id = si.location_id
                     and not exists (
                       select 1 from recipe_items ri
                       where ri.product_id = c.component_product_id
                         and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
                     )
                 ) then si.quantity else 0 end
                 else case when exists (
                   select 1 from recipe_items ri
                   where ri.product_id = si.product_id
                     and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
                 ) then si.quantity else 0 end
               end), 0) as covered
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        where s.tenant_id = ? and s.location_id = ?
          and s.operational_date between ? and ? and s.status <> 'REFUNDED'
        """, tenantId, locationId, from, to);
    var addonUnits = jdbc.queryForMap("""
        select coalesce(sum(a.quantity * si.quantity), 0) as total,
               coalesce(sum(case when exists (
                 select 1 from recipe_items ri
                 where ri.addon_id = a.addon_id
                   and ri.tenant_id = si.tenant_id and ri.location_id = si.location_id
               ) then a.quantity * si.quantity else 0 end), 0) as covered
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        join sale_item_addons a on a.sale_item_id = si.id
        where s.tenant_id = ? and s.location_id = ?
          and s.operational_date between ? and ? and s.status <> 'REFUNDED'
        """, tenantId, locationId, from, to);
    var totalUnits = ((Number) productUnits.get("total")).longValue()
        + ((Number) addonUnits.get("total")).longValue();
    var coveredUnits = ((Number) productUnits.get("covered")).longValue()
        + ((Number) addonUnits.get("covered")).longValue();
    var coverage = totalUnits == 0 ? new BigDecimal("100.0")
        : BigDecimal.valueOf(coveredUnits).multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(totalUnits), 1, RoundingMode.HALF_UP);

    return new Summary(salesPesos, refundsPesos, netSalesPesos, cashPesos, cardPesos, brebPesos,
        orders, refundCount, averageTicket, costPesos, expensesPesos, profit, byCategory,
        byDay, byHour, byProduct, byExpenseCategory, byIngredient, coverage);
  }

  private long methodTotal(UUID tenantId, UUID locationId, LocalDate from, LocalDate to,
                           String method) {
    return total("""
        select coalesce(sum(p.amount_pesos), 0)
        from payments p
        join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
                     and s.location_id = p.location_id
        where s.tenant_id = ? and s.location_id = ? and s.operational_date between ? and ?
          and p.method = ?::payment_method
        """, tenantId, locationId, from, to, method);
  }

  private long total(String sql, Object... args) {
    var value = jdbc.queryForObject(sql, Long.class, args);
    return value == null ? 0 : value;
  }

  private int count(String sql, Object... args) {
    var value = jdbc.queryForObject(sql, Integer.class, args);
    return value == null ? 0 : value;
  }
}
