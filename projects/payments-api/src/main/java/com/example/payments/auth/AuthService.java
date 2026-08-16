package com.example.payments.auth;

import com.example.payments.auth.AuthDtos.AuthResponse;
import com.example.payments.auth.AuthDtos.LoginRequest;
import com.example.payments.auth.AuthDtos.RegisterRequest;
import com.example.payments.security.JwtService;
import com.example.payments.security.UserPrincipal;
import com.example.payments.user.User;
import com.example.payments.user.UserDto;
import com.example.payments.user.UserRepository;
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
    public AuthResponse register(RegisterRequest request) {
        if (users.existsByUsername(request.username())) {
            throw new ConflictException("Username is already taken");
        }
        User user = new User();
        user.setUsername(request.username().toLowerCase());
        user.setDisplayName(request.displayName());
        user.setPassword(encoder.encode(request.password()));   // BCrypt only
        users.save(user);
        return new AuthResponse(jwtService.issue(user), UserDto.from(user));
    }

    public AuthResponse login(LoginRequest request) {
        var auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.username().toLowerCase(), request.password()));
        UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
        return new AuthResponse(jwtService.issue(principal.user()), UserDto.from(principal.user()));
    }
}
