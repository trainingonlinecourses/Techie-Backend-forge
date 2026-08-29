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

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /** Returns the currently authenticated user (protected). */
    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
        return UserDto.from(principal.user());
    }
}
