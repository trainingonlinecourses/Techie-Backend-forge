package com.backendforge.academy.auth;

import com.backendforge.academy.auth.AuthDtos.AuthResponse;
import com.backendforge.academy.auth.AuthDtos.LoginRequest;
import com.backendforge.academy.auth.AuthDtos.RegisterRequest;
import com.backendforge.academy.common.ConflictException;
import com.backendforge.academy.security.JwtService;
import com.backendforge.academy.security.LoginRateLimiter;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Pure unit tests for {@link AuthService} — no Spring context, all collaborators
 * are Mockito mocks. Fast: runs in milliseconds.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserRepository users;
    @Mock private PasswordEncoder encoder;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtService jwtService;
    @Mock private LoginRateLimiter rateLimiter;
    @Mock private PasswordRecoveryService recoveryService;

    private AuthService service;

    @BeforeEach
    void setUp() {
        service = new AuthService(users, encoder, authenticationManager, jwtService, rateLimiter, recoveryService);
    }

    @Test
    @DisplayName("register: saves lowercased username, BCrypt-hashed password, returns token")
    void registerSavesLowercasedUserAndHashedPassword() {
        when(users.existsByUsername("alice")).thenReturn(false);
        when(encoder.encode("secret123")).thenReturn("$2a$10$hashed");
        when(jwtService.issue(any(User.class))).thenReturn("jwt-token");

        AuthResponse res = service.register(new RegisterRequest("Alice", "secret123", "Alice A", null, null));

        assertThat(res.token()).isEqualTo("jwt-token");
        assertThat(res.user().username()).isEqualTo("alice"); // lowercased
        assertThat(res.user().displayName()).isEqualTo("Alice A");

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getUsername()).isEqualTo("alice");
        assertThat(saved.getPassword()).isEqualTo("$2a$10$hashed"); // hash stored, never plaintext
    }

    @Test
    @DisplayName("register: duplicate username (case-insensitive) → ConflictException, nothing saved")
    void registerRejectsDuplicateUsername() {
        when(users.existsByUsername("bob")).thenReturn(true);

        assertThatThrownBy(() -> service.register(new RegisterRequest("Bob", "secret123", "Bob", null, null)))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already taken");

        verify(users, never()).save(any());
        verify(jwtService, never()).issue(any());
    }

    @Test
    @DisplayName("register: arms recovery question when provided; display name defaults to username")
    void registerArmsRecoveryAndDefaultsDisplayName() {
        when(users.existsByUsername("dorothy")).thenReturn(false);
        when(encoder.encode("secret123")).thenReturn("$2a$10$hashed");
        when(jwtService.issue(any(User.class))).thenReturn("jwt-d");

        AuthResponse res = service.register(
                new RegisterRequest("dorothy", "secret123", null, "First pet's name?", "blue whale"));

        assertThat(res.user().displayName()).isEqualTo("dorothy"); // blank display → username
        verify(recoveryService).setRecoveryQuestion(any(User.class), eq("First pet's name?"), eq("blue whale"));
    }

    @Test
    @DisplayName("login: success returns token for the authenticated user")
    void loginSuccessReturnsToken() {
        User dbUser = new User();
        dbUser.setUsername("carol");
        dbUser.setDisplayName("Carol");
        UserPrincipal principal = new UserPrincipal(dbUser);
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(rateLimiter.tryAcquire("1.2.3.4")).thenReturn(true);
        when(jwtService.issue(dbUser)).thenReturn("jwt-carol");

        AuthResponse res = service.login(new LoginRequest("Carol", "pw123456"), "1.2.3.4");

        assertThat(res.token()).isEqualTo("jwt-carol");
        assertThat(res.user().username()).isEqualTo("carol");
        verify(rateLimiter).reset("1.2.3.4"); // success resets the failure counter
        // username is lowercased before the provider lookup
        verify(authenticationManager).authenticate(
                eq(new UsernamePasswordAuthenticationToken("carol", "pw123456")));
    }

    @Test
    @DisplayName("login: wrong password records a FAILURE, not a mere attempt")
    void loginWrongPasswordThrows() {
        when(rateLimiter.tryAcquire("1.2.3.4")).thenReturn(true);
        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("bad"));

        assertThatThrownBy(() -> service.login(new LoginRequest("dave", "wrongpw"), "1.2.3.4"))
                .isInstanceOf(BadCredentialsException.class);

        verify(rateLimiter).recordFailure("1.2.3.4");
        verify(rateLimiter, never()).reset(anyString());
    }

    @Test
    @DisplayName("login: a successful attempt consumes NO failure budget")
    void loginSuccessNeverCountsAsFailure() {
        User dbUser = new User();
        dbUser.setUsername("frank");
        dbUser.setDisplayName("Frank");
        UserPrincipal principal = new UserPrincipal(dbUser);
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        when(rateLimiter.tryAcquire("9.9.9.9")).thenReturn(true);
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(jwtService.issue(dbUser)).thenReturn("jwt-frank");

        service.login(new LoginRequest("frank", "pw123456"), "9.9.9.9");

        verify(rateLimiter, never()).recordFailure(anyString());
    }

    @Test
    @DisplayName("login: rate-limited IP → DisabledException with retry hint (handler maps to 429)")
    void loginRateLimitedThrows() {
        when(rateLimiter.tryAcquire("5.6.7.8")).thenReturn(false);
        when(rateLimiter.remainingSeconds("5.6.7.8")).thenReturn(120L);

        assertThatThrownBy(() -> service.login(new LoginRequest("erin", "pw123456"), "5.6.7.8"))
                .isInstanceOf(DisabledException.class)
                .hasMessageContaining("120");

        verify(authenticationManager, never()).authenticate(any());
        // A blocked request must not count as a failure either — the window is already closed
        verify(rateLimiter, never()).recordFailure(anyString());
    }
}
