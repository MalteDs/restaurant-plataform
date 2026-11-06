package com.caja.synchronization;

import com.caja.devices.DevicePrincipal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SyncController {
  private final SyncService sync;

  public SyncController(SyncService sync) {
    this.sync = sync;
  }

  @PostMapping("/operations")
  public SyncResponse push(@RequestBody SyncRequest request,
                           @AuthenticationPrincipal DevicePrincipal device) {
    var batch = new SyncBatch(device.deviceId(), device.tenantId(), device.locationId(),
        request.operations());
    return new SyncResponse(sync.push(batch));
  }

  public record SyncRequest(List<SyncOperation> operations) {
  }

  public record SyncResponse(List<SyncResult> operations) {
  }
}
