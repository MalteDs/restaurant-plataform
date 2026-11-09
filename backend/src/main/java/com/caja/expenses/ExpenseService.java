package com.caja.expenses;

import com.caja.audit.AuditService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ExpenseService {
  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public ExpenseService(JdbcTemplate jdbc, AuditService audit) {
    this.jdbc = jdbc;
    this.audit = audit;
  }

  @Transactional
  public UUID create(UUID tenantId, UUID locationId, UUID userId, UUID categoryId,
                     String legacyCategory, String description, long amountPesos,
                     LocalDate expenseDate) {
    var category = resolveCategory(tenantId, locationId, categoryId, legacyCategory);
    var id = UUID.randomUUID();
    jdbc.update("""
        insert into expenses(id, tenant_id, location_id, user_id, category,
                             expense_category_id, description, amount_pesos, expense_date)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, id, tenantId, locationId, userId, category, categoryId, description, amountPesos,
        expenseDate);
    audit.record(tenantId, locationId, userId, "EXPENSE_CREATED", "expense", id,
        Map.of("amountPesos", amountPesos, "category", category));
    return id;
  }

  private String resolveCategory(UUID tenantId, UUID locationId, UUID categoryId,
                                 String legacyCategory) {
    if (categoryId != null) {
      return jdbc.query("""
          select name from expense_categories
          where id = ? and tenant_id = ? and location_id = ? and active
          """, (rs, rowNum) -> rs.getString("name"), categoryId, tenantId, locationId)
          .stream().findFirst()
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
              "Categoria de gasto invalida"));
    }
    if (legacyCategory != null && !legacyCategory.isBlank()) {
      return legacyCategory.trim();
    }
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "La categoria de gasto es obligatoria");
  }

  public List<ExpenseCategory> categories(UUID tenantId, UUID locationId) {
    return jdbc.query("""
        select id, name, sort_order, active
        from expense_categories
        where tenant_id = ? and location_id = ?
        order by sort_order, name
        """, (rs, rowNum) -> new ExpenseCategory(rs.getObject("id", UUID.class),
        rs.getString("name"), rs.getInt("sort_order"), rs.getBoolean("active")), tenantId,
        locationId);
  }

  @Transactional
  public UUID createCategory(UUID tenantId, UUID locationId, String name) {
    if (name == null || name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var id = UUID.randomUUID();
    try {
      jdbc.update("""
          insert into expense_categories(id, tenant_id, location_id, name)
          values (?, ?, ?, ?)
          """, id, tenantId, locationId, name.trim());
    } catch (DataIntegrityViolationException e) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "La categoria ya existe");
    }
    return id;
  }

  @Transactional
  public void updateCategory(UUID tenantId, UUID locationId, UUID categoryId, String name,
                             Boolean active) {
    if (name != null && name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre no puede estar vacio");
    }
    var updated = jdbc.update("""
        update expense_categories
        set name = coalesce(?, name), active = coalesce(?, active), updated_at = now()
        where id = ? and tenant_id = ? and location_id = ?
        """, name == null ? null : name.trim(), active, categoryId, tenantId, locationId);
    if (updated == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria no encontrada");
    }
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

  public record ExpenseCategory(UUID id, String name, int sortOrder, boolean active) {
  }
}
