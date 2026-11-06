package com.caja.shared.tenant;

import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TenantContextTest {
  @Test void unresolvedContextFailsClosed() {
    var context = new TenantContext();
    assertThrows(IllegalStateException.class, context::tenantId);
    assertThrows(IllegalStateException.class, context::locationId);
  }

  @Test void resolvesTenantAndLocationOnlyOnce() {
    var context = new TenantContext();
    var tenant = new TenantId(UUID.randomUUID());
    var location = UUID.randomUUID();

    context.resolve(tenant, location);

    assertEquals(tenant, context.tenantId());
    assertEquals(location, context.locationId());
    assertThrows(IllegalStateException.class,
        () -> context.resolve(new TenantId(UUID.randomUUID()), UUID.randomUUID()));
  }
}
