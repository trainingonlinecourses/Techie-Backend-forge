package com.backendforge.academy.auth;

import com.backendforge.academy.auth.PasswordRecoveryService.RecoveryResult;
import com.backendforge.academy.common.ConflictException;
import com.backendforge.academy.security.JwtService;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the security-question recovery flow — normalization rules,
 * the knowledge check, per-username lockout, and the single-use reset handoff.
 * Uses a REAL BCrypt encoder so the answer-hash round trip is exercised for real.
 */
@ExtendWith(MockitoExtension.class)
class PasswordRecoveryServiceTest {

    @Mock private UserRepository users;
    @Mock private JwtService jwtService;

    private PasswordEncoder encoder;
    private PasswordRecoveryService service;

    private User alice;

    @BeforeEach
    void setUp() {
        encoder = new BCryptPasswordEncoder();
        service = new PasswordRecoveryService(users, encoder, jwtService);

        alice = new User();
        alice.setUsername("alice");
        alice.setDisplayName("Alice");
        alice.setPassword(encoder.encode("old-password"));
        // Arm via the real path so the stored hash is exactly what production stores.
        service.setRecoveryQuestion(alice, "First pet's name?", "Blue Whale!");
    }

    private void aliceIsInDb() {
        when(users.findByUsername("alice")).thenReturn(Optional.of(alice));
    }

    @Test
    @DisplayName("normalization: case, punctuation and extra spaces do not change the answer")
    void answerNormalizationIsForgiving() {
        assertThat(PasswordRecoveryService.normalizeAnswer("  Blue   Whale! "))
                .isEqualTo(PasswordRecoveryService.normalizeAnswer("blue whale"));
        assertThat(PasswordRecoveryService.normalizeAnswer("St. Patrick's Day"))
                .isEqualTo(PasswordRecoveryService.normalizeAnswer("st patricks day"));
        // but different words still differ
        assertThat(PasswordRecoveryService.normalizeAnswer("blue whale"))
                .isNotEqualTo(PasswordRecoveryService.normalizeAnswer("green whale"));
    }

    @Test
    @DisplayName("verify: correct answer (typed differently) → success + scoped reset token")
    void correctAnswerIssuesScopedToken() {
        aliceIsInDb();
        when(jwtService.issueScoped(eq(alice), eq("pw-reset"), any())).thenReturn("scoped-token");

        RecoveryResult result = service.startRecovery("Alice", "blue   WHALE"); // messy typing

        assertThat(result.success()).isTrue();
        assertThat(result.resetToken()).isEqualTo("scoped-token");
        assertThat(result.error()).isNull();
    }

    @Test
    @DisplayName("verify: wrong answer → failure, attempts remaining surfaced")
    void wrongAnswerFailsWithRemainingAttempts() {
        aliceIsInDb();

        RecoveryResult result = service.startRecovery("alice", "hamster");

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("4");
        assertThat(result.resetToken()).isNull();
    }

    @Test
    @DisplayName("verify: unknown user and unarmed user get the same generic failure")
    void unknownAndUnarmedUsersAreIndistinguishable() {
        when(users.findByUsername("ghost")).thenReturn(Optional.empty());

        RecoveryResult unknown = service.startRecovery("ghost", "whatever");
        assertThat(unknown.success()).isFalse();
        assertThat(unknown.resetToken()).isNull();
        assertThat(unknown.error()).contains("4"); // same shape as a wrong answer

        User unarmed = new User();
        unarmed.setUsername("bob");
        when(users.findByUsername("bob")).thenReturn(Optional.of(unarmed));
        RecoveryResult unarmedResult = service.startRecovery("bob", "whatever");
        assertThat(unarmedResult.success()).isFalse();
    }

    @Test
    @DisplayName("verify: 5 wrong answers lock recovery for the window; message announces it")
    void fiveFailuresLockRecovery() {
        aliceIsInDb();
        for (int i = 0; i < 5; i++) {
            service.startRecovery("alice", "wrong " + i);
        }

        RecoveryResult locked = service.startRecovery("alice", "blue whale"); // even the RIGHT answer
        assertThat(locked.success()).isFalse();
        assertThat(locked.error()).contains("locked");
    }

    @Test
    @DisplayName("verify: a correct answer clears the failure count")
    void successClearsFailures() {
        aliceIsInDb();
        when(jwtService.issueScoped(any(), anyString(), any())).thenReturn("t1");
        service.startRecovery("alice", "wrong");
        service.startRecovery("alice", "wrong");
        assertThat(service.startRecovery("alice", "blue whale").success()).isTrue();

        // failures cleared → 2 more wrong answers are still below the limit
        service.startRecovery("alice", "wrong");
        RecoveryResult result = service.startRecovery("alice", "wrong");
        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("3"); // not locked, full budget minus the 2 prior
    }

    @Test
    @DisplayName("reset: valid scoped token swaps the password")
    void validTokenResetsPassword() {
        when(jwtService.scopedSubject("good-token", "pw-reset")).thenReturn("alice");
        aliceIsInDb();

        service.completeReset("good-token", "new-password-1");

        // save() also ran once during setUp's arming — assert on the LAST save.
        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(users, org.mockito.Mockito.atLeastOnce()).save(captor.capture());
        User savedLast = captor.getValue();
        // Real encoder: the stored value is a fresh BCrypt hash of the NEW password.
        assertThat(encoder.matches("new-password-1", savedLast.getPassword())).isTrue();
        assertThat(encoder.matches("old-password", savedLast.getPassword())).isFalse();
    }

    @Test
    @DisplayName("reset: wrong-purpose or garbage token fails closed")
    void badTokensFailClosed() {
        when(jwtService.scopedSubject("garbage", "pw-reset")).thenReturn(null);

        assertThatThrownBy(() -> service.completeReset("garbage", "new-password-1"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("reset: token for an unknown user fails closed")
    void tokenForUnknownUserFailsClosed() {
        when(jwtService.scopedSubject("t", "pw-reset")).thenReturn("deleted-user");
        when(users.findByUsername("deleted-user")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.completeReset("t", "new-password-1"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("change password: correct current password swaps it")
    void changePasswordWorks() {
        when(users.save(alice)).thenReturn(alice);

        service.changePassword(alice, "old-password", "new-password-1");

        assertThat(encoder.matches("new-password-1", alice.getPassword())).isTrue();
    }

    @Test
    @DisplayName("change password: wrong current password → ConflictException, unchanged")
    void changePasswordRejectsWrongCurrent() {
        assertThatThrownBy(() -> service.changePassword(alice, "not-my-password", "new-password-1"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Current password");
        // unchanged
        assertThat(encoder.matches("old-password", alice.getPassword())).isTrue();
    }

    @Test
    @DisplayName("arm: rejects short questions and empty answers")
    void armValidation() {
        assertThatThrownBy(() -> service.setRecoveryQuestion(alice, "hi?", "answer"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.setRecoveryQuestion(alice, "Valid question?", "   "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("clear: removes both question and hash")
    void clearDisarms() {
        service.clearRecoveryQuestion(alice);
        assertThat(alice.getRecoveryQuestion()).isNull();
        assertThat(alice.getRecoveryAnswerHash()).isNull();
    }
}
