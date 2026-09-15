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

            /** Optional — defaults to the username. */
            @Size(max = 120)
            String displayName,

            /** Optional security question for account recovery (armed at signup). */
            @Size(max = 200, message = "question must be at most 200 characters")
            String recoveryQuestion,

            /** Plaintext answer; stored only as a BCrypt hash of the normalized form. */
            @Size(max = 200, message = "answer must be at most 200 characters")
            String recoveryAnswer) {}

    public record LoginRequest(
            @NotBlank(message = "username is required") String username,
            @NotBlank(message = "password is required") String password) {}

    public record AuthResponse(String token, UserDto user) {}

    /** Step 1: who is recovering, and their answer to the armed question. */
    public record RecoverStartRequest(
            @NotBlank(message = "username is required") String username,
            @NotBlank(message = "answer is required") String answer) {}

    /** Step 1 response — identical shape for success and failure (no enumeration). */
    public record RecoverStartResponse(boolean success, String message, String resetToken) {}

    /** Step 2: swap the password using the single-use, 10-minute reset token. */
    public record RecoverResetRequest(
            @NotBlank(message = "reset token is required") String resetToken,
            @NotBlank(message = "new password is required")
            @Size(min = 6, max = 100, message = "password must be at least 6 characters")
            String newPassword) {}

    /** Armed question lookup — question is null when the account has none. */
    public record RecoveryQuestionResponse(boolean armed, String question) {}

    /** Change password (authenticated; requires the CURRENT password). */
    public record ChangePasswordRequest(
            @NotBlank(message = "current password is required") String currentPassword,
            @NotBlank(message = "new password is required")
            @Size(min = 6, max = 100, message = "password must be at least 6 characters")
            String newPassword) {}

    /** Arm or replace the recovery question (authenticated). */
    public record SetRecoveryRequest(
            @NotBlank(message = "question is required")
            @Size(min = 5, max = 200, message = "question must be 5-200 characters")
            String question,
            @NotBlank(message = "answer is required")
            @Size(max = 200, message = "answer must be at most 200 characters")
            String answer) {}
}
