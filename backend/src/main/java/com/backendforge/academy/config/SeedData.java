package com.backendforge.academy.config;

import com.backendforge.academy.user.Role;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Creates the demo accounts — <b>local development only</b>.
 *
 * <p>Red-team hardening: {@code admin/admin123} and {@code learner/learner123} are
 * committed to the repository and listed on the login page, so seeding them into a
 * public deployment hands everyone an ADMIN role. Non-local environments skip
 * seeding entirely; the production admin account must be provisioned explicitly
 * (register, then promote the role in the database).
 */
@Component
public class SeedData implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedData.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Environment env;

    public SeedData(UserRepository users, PasswordEncoder encoder, Environment env) {
        this.users = users;
        this.encoder = encoder;
        this.env = env;
    }

    @Override
    public void run(String... args) {
        if (!isLocal()) {
            lockDemoAccounts();
            return;
        }
        seed("admin", "admin123", "Academy Admin", Role.ADMIN);
        seed("learner", "learner123", "Curious Learner", Role.USER);
    }

    /**
     * Non-local hardening: databases seeded by OLDER deploys may still contain the
     * committed demo credentials (admin/admin123, learner/learner123) — including
     * one with the ADMIN role. Deleting the rows risks FK violations from progress
     * and chat history, so instead their passwords are randomized to values nobody
     * knows. The committed passwords stop working on the first boot of this build.
     */
    private void lockDemoAccounts() {
        for (String demo : List.of("admin", "learner")) {
            users.findByUsername(demo).ifPresent(u -> {
                u.setPassword(encoder.encode(UUID.randomUUID().toString()));
                users.save(u);
                log.warn("Non-local environment: randomized the password of default-credential "
                        + "demo account '{}' (the committed demo password no longer works)", demo);
            });
        }
    }

    /**
     * Local = a local/test profile, OR no production marker. PORT alone is a weak
     * signal (plenty of dev machines export it); the real production markers are
     * RENDER (Render sets it on every service) and DATABASE_URL (required by the
     * platform guardrail before an external DB is used at all).
     */
    private boolean isLocal() {
        for (String p : env.getActiveProfiles()) {
            if (p.contains("local") || p.contains("test")) return true;
        }
        String active = env.getProperty("spring.profiles.active");
        if (active != null && (active.contains("local") || active.contains("test"))) return true;
        return env.getProperty("RENDER") == null && env.getProperty("DATABASE_URL") == null;
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
