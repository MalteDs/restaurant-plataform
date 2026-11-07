package com.caja.audit;

import com.caja.identity.AuthenticatedUser;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit")
public class AuditController {
  private static final ZoneId OPERATING_ZONE = ZoneId.of("America/Bogota");

  private final AuditService audit;

  public AuditController(AuditService audit) {
    this.audit = audit;
  }

  @GetMapping
  @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
  public AuditService.AuditEvent[] list(
      @RequestParam(required = false)
      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false)
      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @AuthenticationPrincipal AuthenticatedUser user) {
    var start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
    var end = to == null ? LocalDate.now() : to;
    return audit.list(user.tenantId(), user.locationId(),
        start.atStartOfDay(OPERATING_ZONE).toInstant(),
        end.atTime(LocalTime.MAX).atZone(OPERATING_ZONE).toInstant()).toArray(
            AuditService.AuditEvent[]::new);
  }
}
