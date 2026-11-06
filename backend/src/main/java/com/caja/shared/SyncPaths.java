package com.caja.shared;

import jakarta.servlet.http.HttpServletRequest;

/** Routes that authenticate with the device token instead of the user token. */
public final class SyncPaths {
  private SyncPaths() {
  }

  public static boolean isSync(HttpServletRequest request) {
    var uri = request.getRequestURI();
    var contextPath = request.getContextPath();
    if (!contextPath.isEmpty() && uri.startsWith(contextPath)) {
      uri = uri.substring(contextPath.length());
    }
    return uri.equals("/api/sync") || uri.startsWith("/api/sync/");
  }
}
