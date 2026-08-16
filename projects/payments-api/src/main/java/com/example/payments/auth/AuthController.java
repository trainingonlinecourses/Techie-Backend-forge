package com.example.payments.auth;

import com.example.payments.auth.AuthDtos.AuthResponse;
import com.example.payments.auth.AuthDtos.LoginRequest;
import com.example.payments.auth.AuthDtos.RegisterRequest;
import com.example.payments.security.UserPrincipal;
import com.example.payments.user.UserDto;
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
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal UserPrincipal principal) {
        return UserDto.from(principal.user());
    }
}
