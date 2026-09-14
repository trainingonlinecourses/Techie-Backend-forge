package com.backendforge.academy.auth;

import com.backendforge.academy.auth.AuthDtos.AuthResponse;
import com.backendforge.academy.auth.AuthDtos.LoginRequest;
import com.backendforge.academy.auth.AuthDtos.RegisterRequest;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.UserDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        return authService.register(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req,
                              HttpServletRequest request) {
        String clientIp = getClientIp(request);
        return authService.login(req, clientIp);
    }

    /**
     * Best-effort client IP for rate limiting.
     *
     * X-Forwarded-For is attacker-forgeable, so it is only trusted when it carries a
     * PROXY-APPENDED chain (more than one hop): a real client sends either no XFF or
     * one spoofed value, the trusted edge proxy then APPENDS the actual peer address,
     * and the last hop becomes the only trustworthy entry. A single-hop XFF (the
     * attacker claiming an IP directly) is ignored in favor of the socket address —
     * otherwise rotating fake headers would defeat the limiter entirely. The limiter
     * additionally sanitizes and bounds whatever key it gets.
     */
    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && xff.contains(",")) {
            String[] hops = xff.split(",");
            return hops[hops.length - 1].trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Returns the currently authenticated user. Protected: requires a valid JWT.
     * Returns 401 when no (or an invalid) token is presented.
     */
    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Authentication required");
        }
        return UserDto.from(principal.user());
    }
}
