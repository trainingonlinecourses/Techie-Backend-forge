package com.example.payments.auth;

import com.example.payments.user.UserDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 60) String username,
            @NotBlank @Size(min = 6, max = 100) String password,
            @NotBlank @Size(max = 120) String displayName) {}

    public record LoginRequest(
            @NotBlank String username,
            @NotBlank String password) {}

    public record AuthResponse(String token, UserDto user) {}
}
