package com.backendforge.academy.auth;

import com.backendforge.academy.auth.AuthDtos.AuthResponse;
import com.backendforge.academy.auth.AuthDtos.LoginRequest;
import com.backendforge.academy.auth.AuthDtos.RegisterRequest;
import com.backendforge.academy.common.ConflictException;
import com.backendforge.academy.security.JwtService;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserDto;
import com.backendforge.academy.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
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

    public AuthService(UserRepository users, PasswordEncoder encoder,
                       AuthenticationManager authenticationManager, JwtService jwtService) {
        this.users = users;
        this.encoder = encoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (users.existsByUsername(req.username().toLowerCase())) {
            throw new ConflictException("Username is already taken");
        }
        User user = new User();
        user.setUsername(req.username().toLowerCase());
        user.setDisplayName(req.displayName());
        user.setPassword(encoder.encode(req.password())); // BCrypt — never store plaintext
        users.save(user);
        return new AuthResponse(jwtService.issue(user), UserDto.from(user));
    }

    public AuthResponse login(LoginRequest req) {
        // Delegates to DaoAuthenticationProvider: loads the user, checks the BCrypt hash.
        var auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(req.username().toLowerCase(), req.password()));
        UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
        return new AuthResponse(jwtService.issue(principal.user()), UserDto.from(principal.user()));
    }
}
