package com.caja.synchronization;

import java.util.List;
import java.util.UUID;

public record SyncBatch(UUID deviceId, UUID tenantId, UUID locationId, List<SyncOperation> operations) {
}
