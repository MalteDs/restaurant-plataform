package com.caja.expenses;

import com.caja.audit.AuditService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpenseService {
  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public ExpenseService(JdbcTemplate jdbc, AuditService audit) {
    this.jdbc = jdbc;
    this.audit = audit;
  }

  @Transactional
  public UUID create(UUID tenantId, UUID locationId, UUID userId, String category,
                     String description, long amountPesos, LocalDate expenseDate) {
    var id = UUID.randomUUID();
    jdbc.update("""
        insert into expenses(id, tenant_id, location_id, user_id, category, description,
                             amount_pesos, expense_date)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        """, id, tenantId, locationId, userId, category, description, amountPesos, expenseDate);
    audit.record(tenantId, locationId, userId, "EXPENSE_CREATED", "expense", id,
        Map.of("amountPesos", amountPesos, "category", category));
    return id;
  }

  public List<Expense> list(UUID tenantId, UUID locationId, LocalDate from, LocalDate to) {
    return jdbc.query("""
        select id, category, description, amount_pesos, expense_date
        from expenses
        where tenant_id = ? and location_id = ? and expense_date between ? and ?
        order by expense_date desc, created_at desc
        """, (rs, rowNum) -> new Expense(rs.getObject("id", UUID.class), rs.getString("category"),
        rs.getString("description"), rs.getLong("amount_pesos"),
        rs.getDate("expense_date").toLocalDate()), tenantId, locationId, from, to);
  }

  public record Expense(UUID id, String category, String description, long amountPesos,
                        LocalDate expenseDate) {
  }
}
