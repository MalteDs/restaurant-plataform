package com.caja.synchronization;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record SyncOperation(UUID operationId, long seq, String type, UUID entityId, UUID userId,
                            Instant clientCreatedAt, Map<String, Object> payload) {
}
