package com.caja.synchronization;

import java.util.Map;
import java.util.UUID;

public record SyncResult(UUID operationId, SyncStatus status, Map<String, Object> result, String error) {
}
