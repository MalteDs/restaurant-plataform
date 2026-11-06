package com.caja.shared.tenant;

import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

/** Holds the tenant and location resolved from the request token for the current request. */
@Component
@RequestScope
public class TenantContext {
  private TenantId tenantId;
  private UUID locationId;

  public void resolve(TenantId tenantId, UUID locationId) {
    if (this.tenantId != null) {
      throw new IllegalStateException("Tenant already resolved for this request");
    }
    this.tenantId = tenantId;
    this.locationId = locationId;
  }

  public TenantId tenantId() {
    if (tenantId == null) {
      throw new IllegalStateException("Tenant not resolved for this request");
    }
    return tenantId;
  }

  public UUID locationId() {
    if (locationId == null) {
      throw new IllegalStateException("Location not resolved for this request");
    }
    return locationId;
  }
}
