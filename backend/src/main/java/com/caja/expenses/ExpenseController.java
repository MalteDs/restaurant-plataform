package com.caja.expenses;

import com.caja.identity.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {
  private final ExpenseService expenses;

  public ExpenseController(ExpenseService expenses) {
    this.expenses = expenses;
  }

  @PostMapping
  @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
  public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody ExpenseRequest request,
                                                     @AuthenticationPrincipal AuthenticatedUser user) {
    var id = expenses.create(user.tenantId(), user.locationId(), user.userId(),
        request.expenseCategoryId(), request.category(), request.description(),
        request.amountPesos(),
        request.expenseDate() == null ? LocalDate.now() : request.expenseDate());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @GetMapping("/categories")
  @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
  public List<ExpenseService.ExpenseCategory> categories(
      @AuthenticationPrincipal AuthenticatedUser user) {
    return expenses.categories(user.tenantId(), user.locationId());
  }

  @PostMapping("/categories")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Map<String, Object>> createCategory(
      @Valid @RequestBody CategoryRequest request,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var id = expenses.createCategory(user.tenantId(), user.locationId(), request.name());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
  }

  @PutMapping("/categories/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> updateCategory(@PathVariable UUID id,
                                              @Valid @RequestBody CategoryUpdate request,
                                              @AuthenticationPrincipal AuthenticatedUser user) {
    expenses.updateCategory(user.tenantId(), user.locationId(), id, request.name(),
        request.active());
    return ResponseEntity.noContent().build();
  }

  @GetMapping
  @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
  public ExpenseList list(@RequestParam(required = false)
                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                           @RequestParam(required = false)
                           @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                           @AuthenticationPrincipal AuthenticatedUser user) {
    var start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
    var end = to == null ? LocalDate.now() : to;
    var items = expenses.list(user.tenantId(), user.locationId(), start, end);
    var total = items.stream().mapToLong(ExpenseService.Expense::amountPesos).sum();
    return new ExpenseList(items, total);
  }

  public record ExpenseRequest(UUID expenseCategoryId,
                                @Size(max = 100) String category,
                                @NotBlank @Size(max = 200) String description,
                                @NotNull @Positive Long amountPesos,
                                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate expenseDate) {
  }

  public record CategoryRequest(@NotBlank @Size(max = 100) String name) {
  }

  public record CategoryUpdate(@Size(max = 100) String name, Boolean active) {
  }

  public record ExpenseList(java.util.List<ExpenseService.Expense> expenses, long totalPesos) {
  }
}
