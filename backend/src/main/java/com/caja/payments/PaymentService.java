package com.caja.payments;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {
  private final JdbcTemplate jdbc;

  public PaymentService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void charge(UUID tenantId, UUID locationId, UUID saleId, PaymentMethod method,
                     long amountPesos) {
    jdbc.update("""
        insert into payments(id, tenant_id, location_id, sale_id, method, amount_pesos)
        values (?, ?, ?, ?, ?::payment_method, ?)
        """, UUID.randomUUID(), tenantId, locationId, saleId, method.name(), amountPesos);
  }
}
