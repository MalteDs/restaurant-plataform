package com.caja.identity;

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
public class JwtAuthFilter extends OncePerRequestFilter {
  private final TokenService tokens;
  private final TenantContext tenantContext;

  public JwtAuthFilter(TokenService tokens, TenantContext tenantContext) {
    this.tokens = tokens;
    this.tenantContext = tenantContext;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    // Sync routes authenticate with the device token, never with a user token.
    return SyncPaths.isSync(request);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                  FilterChain chain) throws ServletException, IOException {
    var header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      tokens.parseAccessToken(header.substring("Bearer ".length())).ifPresent(user -> {
        var authority = new SimpleGrantedAuthority("ROLE_" + user.role().name());
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(user, null, List.of(authority)));
        tenantContext.resolve(new TenantId(user.tenantId()), user.locationId());
      });
    }
    chain.doFilter(request, response);
  }
}
