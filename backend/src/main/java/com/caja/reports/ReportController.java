package com.caja.reports;

import com.caja.identity.AuthenticatedUser;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportController {
  private final ReportService reports;

  public ReportController(ReportService reports) {
    this.reports = reports;
  }

  @GetMapping("/summary")
  @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
  public Summary summary(@RequestParam(required = false)
                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                          @RequestParam(required = false)
                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                          @AuthenticationPrincipal AuthenticatedUser user) {
    var start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
    var end = to == null ? LocalDate.now() : to;
    return reports.summary(user.tenantId(), user.locationId(), start, end);
  }
}
