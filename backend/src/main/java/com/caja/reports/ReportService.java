package com.caja.reports;

import com.caja.reports.Summary.DayRow;
import com.caja.reports.Summary.HourRow;
import com.caja.reports.Summary.ProductRow;
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
        """, tenantId, locationId, from, to);
    var costPesos = total("""
        select coalesce(sum(coalesce(si.cost_pesos, 0)), 0)
        from sale_items si
        join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
                     and s.location_id = si.location_id
        where s.tenant_id = ? and s.location_id = ? and s.operational_date between ? and ?
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

    return new Summary(salesPesos, refundsPesos, netSalesPesos, cashPesos, cardPesos, brebPesos,
        orders, refundCount, averageTicket, costPesos, expensesPesos, profit, byDay, byHour,
        byProduct);
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
