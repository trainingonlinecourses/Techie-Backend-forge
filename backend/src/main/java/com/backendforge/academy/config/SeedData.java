package com.backendforge.academy.config;

import com.backendforge.academy.user.Role;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the demo accounts on first startup. */
@Component
public class SeedData implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedData.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public SeedData(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        seed("admin", "admin123", "Academy Admin", Role.ADMIN);
        seed("learner", "learner123", "Curious Learner", Role.USER);
    }

    private void seed(String username, String password, String displayName, Role role) {
        if (users.existsByUsername(username)) return;
        User user = new User();
        user.setUsername(username);
        user.setDisplayName(displayName);
        user.setPassword(encoder.encode(password));
        user.setRole(role);
        users.save(user);
        log.info("Seeded demo user '{}' ({} / {})", username, username, password);
    }
}
