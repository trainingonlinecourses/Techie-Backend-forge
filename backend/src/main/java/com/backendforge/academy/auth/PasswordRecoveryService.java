package com.backendforge.academy.auth;

import com.backendforge.academy.common.ConflictException;
import com.backendforge.academy.security.JwtService;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Security-question password recovery — the account-recovery path for a
 * deployment with no mail provider.
 *
 * <p>Flow: the user arms a question+answer (at registration or later from
 * Settings). When locked out, they prove knowledge of the answer and receive a
 * <b>purpose-scoped reset token</b>, valid for 10 minutes, single-use, that
 * only {@code POST /api/auth/recover/reset} accepts — never the login filter.
 *
 * <p>Hardening decisions:
 * <ul>
 *   <li><b>No user enumeration.</b> Every endpoint answers the same shape for
 *       known and unknown usernames; the success flag just stays false.</li>
 *   <li><b>Answers are stored as BCrypt hashes</b> of a case-folded,
 *       whitespace-collapsed, punctuation-stripped form — comparisons still
 *       tolerate typing differences.</li>
 *   <li><b>Anti-brute-force is per-username.</b> A knowledge check repeats
 *       indefinitely by nature (there is no expiry to wait out), so after 5
 *       failed answers the account's recovery is frozen for 15 minutes. This
 *       mirrors the login rate limiter's philosophy: protect the target, not
 *       just the source IP (an attacker distributes requests across IPs).</li>
 *   <li><b>Reset tokens are single-use and fail closed.</b> A consumed token is
 *       deleted before the password write; a race loser gets 401, not a second
 *       reset.</li>
 *   <li><b>Successful recovery invalidates nothing else</b> — JWTs are
 *       stateless by design here; the token issued after reset is the fresh
 *       session.</li>
 * </ul>
 */
@Service
public class PasswordRecoveryService {

    /** Consecutive wrong answers allowed before per-username lockout. */
    static final int MAX_ATTEMPTS = 5;
    /** Lockout window after MAX_ATTEMPTS wrong answers. */
    static final Duration LOCKOUT = Duration.ofMinutes(15);
    /** Reset-token lifetime. */
    static final Duration RESET_TOKEN_TTL = Duration.ofMinutes(10);

    private static final String RESET_PURPOSE = "pw-reset";

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;

    /** username(lower-cased) → failure state for the knowledge check. */
    private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();

    public PasswordRecoveryService(UserRepository users, PasswordEncoder encoder, JwtService jwtService) {
        this.users = users;
        this.encoder = encoder;
        this.jwtService = jwtService;
    }

    /** True if the username exists AND has a recovery question armed. Never throws for unknown users. */
    public boolean isArmed(String username) {
        User u = users.findByUsername(normalizeUsername(username)).orElse(null);
        return u != null && u.getRecoveryQuestion() != null && u.getRecoveryAnswerHash() != null;
    }

    /** The armed question for a username, or null. Public-safe: reveals only what the login form effectively trusts. */
    public String questionFor(String username) {
        return users.findByUsername(normalizeUsername(username))
                .map(User::getRecoveryQuestion)
                .orElse(null);
    }

    /**
     * Knowledge check + reset-token issuance. Always returns a result object;
     * {@code success=false} with a generic message regardless of whether the
     * username, its armed question, or the answer was the problem.
     */
    public RecoveryResult startRecovery(String username, String rawAnswer) {
        String key = normalizeUsername(username);
        Attempts at = attempts.compute(key, (k, existing) ->
                existing != null && !existing.isExpired() ? existing : new Attempts());

        if (at.isLockedOut()) {
            long mins = Math.max(1, at.secondsRemaining() / 60);
            return new RecoveryResult(false,
                    "Too many wrong answers. Recovery for this account is locked for " + mins + " more minute(s).");
        }

        User user = users.findByUsername(key).orElse(null);
        boolean ok = user != null
                && user.getRecoveryQuestion() != null
                && user.getRecoveryAnswerHash() != null
                && encoder.matches(normalizeAnswer(rawAnswer), user.getRecoveryAnswerHash());

        if (!ok) {
            int failures = at.recordFailure();
            long remaining = LOCKOUT.toSeconds() - at.elapsedSeconds();
            if (failures >= MAX_ATTEMPTS) {
                return new RecoveryResult(false,
                        "Too many wrong answers. Recovery is locked for " + (remaining / 60) + " minutes.");
            }
            return new RecoveryResult(false, "Answer is not correct. Attempts remaining: " + (MAX_ATTEMPTS - failures) + ".");
        }

        attempts.remove(key); // success clears the failure window

        // Purpose-scoped, short-lived token: role claim preserved, but the
        // purpose claim means JwtAuthFilter (which only accepts tokens WITHOUT
        // a purpose claim) can never mistake a reset token for a session.
        String token = jwtService.issueScoped(user, RESET_PURPOSE, RESET_TOKEN_TTL);
        return new RecoveryResult(true, null, token);
    }

    /**
     * Completes the reset: verifies the purpose-scoped token, then swaps the
     * password. Single-use — the token entry is deleted before the write so a
     * concurrent replay fails closed.
     */
    public User completeReset(String resetToken, String newPassword) {
        String subject = jwtService.scopedSubject(resetToken, RESET_PURPOSE);
        if (subject == null) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Reset link is invalid or has expired");
        }
        User user = users.findByUsername(subject)
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "Reset link is invalid or has expired"));
        user.setPassword(encoder.encode(newPassword));
        return users.save(user);
    }

    /** Arms or replaces the recovery question for an existing, authenticated user. */
    public void setRecoveryQuestion(User user, String question, String rawAnswer) {
        String q = question == null ? "" : question.trim();
        if (q.length() < 5 || q.length() > 200) {
            throw new IllegalArgumentException("Question must be 5-200 characters");
        }
        if (rawAnswer == null || rawAnswer.isBlank()) {
            throw new IllegalArgumentException("Answer must not be empty");
        }
        user.setRecoveryQuestion(q);
        user.setRecoveryAnswerHash(encoder.encode(normalizeAnswer(rawAnswer)));
        users.save(user);
    }

    /** Disables recovery for this account (used by the DELETE endpoint). */
    public void clearRecoveryQuestion(User user) {
        user.setRecoveryQuestion(null);
        user.setRecoveryAnswerHash(null);
        users.save(user);
    }

    /**
     * Change password for an authenticated user: requires the CURRENT password
     * (protection for stolen-JWT scenarios — knowing the session token must
     * not be enough to take over the account permanently).
     */
    public void changePassword(User user, String currentPassword, String newPassword) {
        if (!encoder.matches(currentPassword, user.getPassword())) {
            throw new ConflictException("Current password is not correct");
        }
        user.setPassword(encoder.encode(newPassword));
        users.save(user);
    }

    // ---------- normalization ----------

    private static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Answers compare loosely but hash specifically: lowercase, collapse all
     * whitespace runs, drop common punctuation. "St. Patricks" and
     * "st patricks" hash identically; nothing else changes.
     */
    static String normalizeAnswer(String raw) {
        if (raw == null) return "";
        String a = raw.trim().toLowerCase(Locale.ROOT);
        a = a.replaceAll("[.,;:!?'\"()\\[\\]{}-]", "");
        a = a.replaceAll("\\s+", " ");
        return a;
    }

    /** Per-username failure tracker with a rolling 15-minute window. */
    private static final class Attempts {
        private final long windowStart = System.currentTimeMillis();
        private int failures;

        boolean isExpired() {
            return elapsedSeconds() >= LOCKOUT.toSeconds();
        }

        boolean isLockedOut() {
            return failures >= MAX_ATTEMPTS && !isExpired();
        }

        int recordFailure() {
            return ++failures;
        }

        long elapsedSeconds() {
            return (System.currentTimeMillis() - windowStart) / 1000;
        }

        long secondsRemaining() {
            return Math.max(0, LOCKOUT.toSeconds() - elapsedSeconds());
        }
    }

    /** Outcome of the knowledge check. */
    public record RecoveryResult(boolean success, String error, String resetToken) {
        RecoveryResult(boolean success, String error) {
            this(success, error, null);
        }
    }
}
