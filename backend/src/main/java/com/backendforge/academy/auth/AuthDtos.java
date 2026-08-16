package com.backendforge.academy.auth;

import com.backendforge.academy.user.UserDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank(message = "username is required")
            @Size(min = 3, max = 60, message = "username must be 3-60 characters")
            String username,

            @NotBlank(message = "password is required")
            @Size(min = 6, max = 100, message = "password must be at least 6 characters")
            String password,

            @NotBlank(message = "display name is required")
            @Size(max = 120)
            String displayName) {}

    public record LoginRequest(
            @NotBlank(message = "username is required") String username,
            @NotBlank(message = "password is required") String password) {}

    public record AuthResponse(String token, UserDto user) {}
}
