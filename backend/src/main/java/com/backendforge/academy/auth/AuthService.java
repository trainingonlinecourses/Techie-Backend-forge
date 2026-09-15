package com.backendforge.academy.auth;

import com.backendforge.academy.auth.AuthDtos.AuthResponse;
import com.backendforge.academy.auth.AuthDtos.LoginRequest;
import com.backendforge.academy.auth.AuthDtos.RegisterRequest;
import com.backendforge.academy.common.ConflictException;
import com.backendforge.academy.security.JwtService;
import com.backendforge.academy.security.LoginRateLimiter;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserDto;
import com.backendforge.academy.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final LoginRateLimiter rateLimiter;
    private final PasswordRecoveryService recoveryService;

    public AuthService(UserRepository users, PasswordEncoder encoder,
                       AuthenticationManager authenticationManager, JwtService jwtService,
                       LoginRateLimiter rateLimiter, PasswordRecoveryService recoveryService) {
        this.users = users;
        this.encoder = encoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.rateLimiter = rateLimiter;
        this.recoveryService = recoveryService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (users.existsByUsername(req.username().toLowerCase())) {
            throw new ConflictException("Username is already taken");
        }
        User user = new User();
        user.setUsername(req.username().toLowerCase());
        user.setDisplayName(
                req.displayName() == null || req.displayName().isBlank()
                        ? req.username() // default display name: the username itself
                        : req.displayName());
        user.setPassword(encoder.encode(req.password())); // BCrypt — never store plaintext
        // Optional at signup: arming now means the account can always be
        // recovered. A partial arm (question without answer) is ignored rather
        // than rejected — the user just hasn't opted into recovery.
        if (req.recoveryQuestion() != null && !req.recoveryQuestion().isBlank()
                && req.recoveryAnswer() != null && !req.recoveryAnswer().isBlank()) {
            recoveryService.setRecoveryQuestion(user, req.recoveryQuestion(), req.recoveryAnswer());
        }
        users.save(user);
        return new AuthResponse(jwtService.issue(user), UserDto.from(user));
    }

    /** Issues a fresh session token for a user (used after a completed password reset). */
    public String issueToken(User user) {
        return jwtService.issue(user);
    }

    public AuthResponse login(LoginRequest req, String clientIp) {
        // Rate-limit by IP to prevent brute-force attacks
        if (!rateLimiter.tryAcquire(clientIp)) {
            long remaining = rateLimiter.remainingSeconds(clientIp);
            throw new org.springframework.security.authentication
                    .DisabledException("Too many login attempts. Try again in " + remaining + " seconds.");
        }
        // Delegates to DaoAuthenticationProvider: loads the user, checks the BCrypt hash.
        try {
            var auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.username().toLowerCase(), req.password()));
            rateLimiter.reset(clientIp); // success clears the failure window
            UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
            return new AuthResponse(jwtService.issue(principal.user()), UserDto.from(principal.user()));
        } catch (BadCredentialsException e) {
            // Count only FAILURES toward the brute-force limit — attempts that never
            // happened (user changed their mind) or that succeeded must not push a
            // legitimate user toward lockout.
            rateLimiter.recordFailure(clientIp);
            // Don't reveal whether the username exists — just say credentials are wrong
            throw new BadCredentialsException("Invalid username or password");
        }
    }
}
