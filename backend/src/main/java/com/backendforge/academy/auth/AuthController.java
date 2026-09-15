package com.backendforge.academy.auth;

import com.backendforge.academy.auth.AuthDtos.AuthResponse;
import com.backendforge.academy.auth.AuthDtos.ChangePasswordRequest;
import com.backendforge.academy.auth.AuthDtos.LoginRequest;
import com.backendforge.academy.auth.AuthDtos.RecoverResetRequest;
import com.backendforge.academy.auth.AuthDtos.RecoverStartRequest;
import com.backendforge.academy.auth.AuthDtos.RecoverStartResponse;
import com.backendforge.academy.auth.AuthDtos.RecoveryQuestionResponse;
import com.backendforge.academy.auth.AuthDtos.RegisterRequest;
import com.backendforge.academy.auth.AuthDtos.SetRecoveryRequest;
import com.backendforge.academy.auth.PasswordRecoveryService.RecoveryResult;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.UserDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordRecoveryService recoveryService;

    public AuthController(AuthService authService, PasswordRecoveryService recoveryService) {
        this.authService = authService;
        this.recoveryService = recoveryService;
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

    // ---------------- account recovery (security question) ----------------

    /**
     * Does this username have a recovery question armed? Public — the login
     * page already trusts a typed username, and the response (a question the
     * user chose) reveals nothing a login attempt wouldn't.
     */
    @GetMapping("/recover/question")
    public RecoveryQuestionResponse recoveryQuestion(@RequestParam("username") String username) {
        String question = recoveryService.questionFor(username);
        // armed=false for both unknown users and unarmed accounts — same shape,
        // no enumeration signal.
        return new RecoveryQuestionResponse(question != null, question);
    }

    /**
     * Step 1 of recovery: knowledge check. Success returns a single-use,
     * 10-minute reset token. Failures are counted per-username (5 → 15-min
     * lockout) and the response shape never reveals whether the username
     * exists.
     */
    @PostMapping("/recover/verify")
    public RecoverStartResponse verifyAnswer(@Valid @RequestBody RecoverStartRequest req) {
        RecoveryResult result = recoveryService.startRecovery(req.username(), req.answer());
        // success → message null + token present; failure → message set, token null.
        return new RecoverStartResponse(result.success(),
                result.success() ? null : result.error(), result.resetToken());
    }

    /**
     * Step 2: complete the reset with the scoped token. Fails closed (401 via
     * AccessDeniedException) for expired, reused, or forged tokens.
     */
    @PostMapping("/recover/reset")
    public Map<String, Object> resetPassword(@Valid @RequestBody RecoverResetRequest req) {
        var user = recoveryService.completeReset(req.resetToken(), req.newPassword());
        // Log the user straight in — a fresh session token for the just-recovered account.
        return Map.of(
                "token", authService.issueToken(user),
                "user", UserDto.from(user));
    }

    // ---------------- authenticated self-service ----------------

    /** Arms or replaces the caller's recovery question. */
    @PutMapping("/recovery-question")
    public Map<String, Object> setRecoveryQuestion(@AuthenticationPrincipal UserPrincipal principal,
                                                   @Valid @RequestBody SetRecoveryRequest req) {
        if (principal == null) {
            throw new org.springframework.security.access.AccessDeniedException("Authentication required");
        }
        recoveryService.setRecoveryQuestion(principal.user(), req.question(), req.answer());
        return Map.of("armed", true);
    }

    /** Removes the recovery question (disable recovery for this account). */
    @DeleteMapping("/recovery-question")
    public Map<String, Object> clearRecoveryQuestion(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw new org.springframework.security.access.AccessDeniedException("Authentication required");
        }
        recoveryService.clearRecoveryQuestion(principal.user());
        return Map.of("armed", false);
    }

    /** Is recovery armed for the caller? */
    @GetMapping("/recovery-question")
    public Map<String, Object> recoveryStatus(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            throw new org.springframework.security.access.AccessDeniedException("Authentication required");
        }
        boolean armed = principal.user().getRecoveryQuestion() != null;
        return Map.of("armed", armed, "question", armed ? principal.user().getRecoveryQuestion() : "");
    }

    /** Change password (requires the CURRENT password). */
    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@AuthenticationPrincipal UserPrincipal principal,
                                              @Valid @RequestBody ChangePasswordRequest req) {
        if (principal == null) {
            throw new org.springframework.security.access.AccessDeniedException("Authentication required");
        }
        recoveryService.changePassword(principal.user(), req.currentPassword(), req.newPassword());
        return Map.of("changed", true);
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
