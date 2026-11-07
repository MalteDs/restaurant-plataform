package com.caja.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;

  public AuditService(JdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public void record(UUID tenantId, UUID locationId, UUID userId, String eventType,
                     String entityType, UUID entityId, Map<String, Object> payload) {
    jdbc.update("""
        insert into audit_events(id, tenant_id, location_id, user_id, event_type, entity_type,
                                 entity_id, payload_json)
        values (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
        """, UUID.randomUUID(), tenantId, locationId, userId, eventType, entityType, entityId,
        payload == null ? null : json.valueToTree(payload).toString());
  }

  public List<AuditEvent> list(UUID tenantId, UUID locationId, Instant from, Instant to) {
    return jdbc.query("""
        select id, user_id, event_type, entity_type, entity_id, payload_json, created_at
        from audit_events
        where tenant_id = ? and location_id = ? and created_at between ? and ?
        order by created_at desc
        """, (rs, rowNum) -> new AuditEvent(
        rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
        rs.getString("event_type"), rs.getString("entity_type"),
        rs.getObject("entity_id", UUID.class), rs.getString("payload_json"),
        rs.getTimestamp("created_at").toInstant()), tenantId, locationId,
        java.sql.Timestamp.from(from), java.sql.Timestamp.from(to));
  }

  public record AuditEvent(UUID id, UUID userId, String eventType, String entityType,
                           UUID entityId, String payloadJson, Instant createdAt) {
  }
}
