package com.backendforge.academy.user;

import java.time.Instant;

public record UserDto(Long id, String username, String displayName, String role, Instant createdAt) {

    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getUsername(), u.getDisplayName(), u.getRole().name(), u.getCreatedAt());
    }
}
