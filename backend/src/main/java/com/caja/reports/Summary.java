package com.caja.reports;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record Summary(long salesPesos, long refundsPesos, long netSalesPesos, long cashPesos,
                      long cardPesos, long brebPesos, int orders, int refundCount,
                      long averageTicketPesos, long costPesos, long expensesPesos,
                      long operatingProfitPesos, List<CategoryRow> byCategory, List<DayRow> byDay,
                      List<HourRow> byHour, List<ProductRow> byProduct,
                      List<ExpenseCategoryRow> byExpenseCategory,
                      List<IngredientRow> byIngredient, BigDecimal recipeCoveragePercent) {
  public record DayRow(LocalDate date, long salesPesos) {
  }

  public record HourRow(int hour, long salesPesos) {
  }

  public record ProductRow(String name, long quantity, long salesPesos) {
  }

  public record CategoryRow(String name, long quantity, long salesPesos) {
  }

  public record ExpenseCategoryRow(String name, long amountPesos) {
  }

  public record IngredientRow(String name, String unit, BigDecimal quantity,
                              BigDecimal wastePercent) {
  }
}
