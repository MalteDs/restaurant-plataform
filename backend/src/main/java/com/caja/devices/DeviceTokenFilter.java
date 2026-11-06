package com.caja.devices;

import com.caja.identity.TokenService;
import com.caja.shared.SyncPaths;
import com.caja.shared.tenant.TenantContext;
import com.caja.shared.tenant.TenantId;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class DeviceTokenFilter extends OncePerRequestFilter {
  private final DeviceRepository devices;
  private final TokenService tokens;
  private final TenantContext tenantContext;

  public DeviceTokenFilter(DeviceRepository devices, TokenService tokens, TenantContext tenantContext) {
    this.devices = devices;
    this.tokens = tokens;
    this.tenantContext = tenantContext;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !SyncPaths.isSync(request);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                  FilterChain chain) throws ServletException, IOException {
    var header = request.getHeader("X-Device-Token");
    if (header == null || header.isBlank()) {
      unauthorized(response, "token de dispositivo requerido");
      return;
    }
    var device = devices.findActiveByTokenHash(tokens.sha256Hex(header));
    if (device.isEmpty()) {
      unauthorized(response, "dispositivo no autorizado");
      return;
    }
    var principal = new DevicePrincipal(device.get().id(), device.get().tenantId(),
        device.get().locationId());
    SecurityContextHolder.getContext().setAuthentication(
        new UsernamePasswordAuthenticationToken(principal, null,
            List.of(new SimpleGrantedAuthority("ROLE_DEVICE"))));
    tenantContext.resolve(new TenantId(device.get().tenantId()), device.get().locationId());
    devices.touch(device.get().id());
    chain.doFilter(request, response);
  }

  private void unauthorized(HttpServletResponse response, String message) throws IOException {
    response.setStatus(401);
    response.setContentType("application/json");
    response.getWriter().write("{\"error\":\"" + message + "\"}");
  }
}
