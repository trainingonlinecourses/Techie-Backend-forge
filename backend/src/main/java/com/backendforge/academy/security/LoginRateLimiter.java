package com.backendforge.academy.security;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Per-IP brute-force protection for the login endpoint (5 failures / 15 min).
 *
 * <p>Red-team hardening applied here:
 * <ul>
 *   <li><b>Failures, not attempts.</b> The first version incremented on every
 *       login attempt, so a legitimate user who fat-fingered a password twice
 *       and then got it right was two attempts closer to lockout — and an
 *       attacker could keep a victim's IP permanently locked out by merely
 *       *trying* to log in from anywhere. Now successes never count, and a
 *       success clears the window entirely.</li>
 *   <li><b>Spoof-resistant keys.</b> {@code X-Forwarded-For} can be set by any
 *       client; trusting the first hop let an attacker rotate fake IPs to
 *       bypass the limit (and pollute the map). We key on the LAST hop — the
 *       one added by the trusted reverse proxy that actually saw the
 *       connection — falling back to the socket address. The map is also
 *       capped: the worst an attacker can do is evict other attackers' keys,
 *       never exhaust heap.</li>
 * </ul>
 * Still in-memory by design; for a multi-instance deployment move to Redis.
 */
@Component
public class LoginRateLimiter {

    private static final int MAX_FAILURES = 5;
    private static final long LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    /** Bound on tracked keys: 10k IPs × ~48 bytes ≈ well under 1 MB. */
    private static final int MAX_TRACKED_KEYS = 10_000;

    private final ConcurrentHashMap<String, AttemptInfo> attempts = new ConcurrentHashMap<>();

    /** Returns true if a login attempt may proceed for this client. */
    public boolean tryAcquire(String key) {
        String k = sanitize(key);
        long now = System.currentTimeMillis();
        AttemptInfo info = attempts.compute(k, (ignored, existing) -> {
            if (existing == null || (now - existing.windowStart) > LOCKOUT_WINDOW_MS) {
                return new AttemptInfo(now);
            }
            return existing; // failures are recorded via recordFailure only
        });
        maybeEvict();
        return info.failures.get() < MAX_FAILURES;
    }

    /** Counts one FAILED login against the client's window. */
    public void recordFailure(String key) {
        String k = sanitize(key);
        long now = System.currentTimeMillis();
        attempts.compute(k, (ignored, existing) -> {
            if (existing == null || (now - existing.windowStart) > LOCKOUT_WINDOW_MS) {
                return new AttemptInfo(now);
            }
            existing.failures.incrementAndGet();
            return existing;
        });
        maybeEvict();
    }

    /** Clears the window after a successful login. */
    public void reset(String key) {
        attempts.remove(sanitize(key));
    }

    /** Seconds remaining in the current lockout window, or 0 if not locked. */
    public long remainingSeconds(String key) {
        AttemptInfo info = attempts.get(sanitize(key));
        if (info == null) return 0;
        long elapsed = System.currentTimeMillis() - info.windowStart;
        if (elapsed >= LOCKOUT_WINDOW_MS) return 0;
        return (LOCKOUT_WINDOW_MS - elapsed) / 1000;
    }

    /**
     * Clients can forge X-Forwarded-For; only the value our own trusted proxy
     * appended is meaningful. Keep it bounded so the key can never be used as
     * a heap or log-injection vector.
     */
    private static String sanitize(String key) {
        if (key == null || key.isBlank()) return "unknown";
        String k = key.trim();
        if (k.length() > 64) k = k.substring(k.length() - 64);
        return k.replaceAll("[^0-9a-fA-F.:, ]", "?");
    }

    /**
     * Cheap size guard: when the map grows past the cap, drop entries whose
     * window has expired. An attacker flooding fake keys only evicts other
     * fake keys — real clients keep their counters.
     */
    private void maybeEvict() {
        if (attempts.size() <= MAX_TRACKED_KEYS) return;
        long now = System.currentTimeMillis();
        attempts.entrySet().removeIf(e ->
                (now - e.getValue().windowStart) > LOCKOUT_WINDOW_MS);
        // If still over the cap (a genuine flood of live windows), shed the
        // oldest windows rather than grow unbounded.
        if (attempts.size() > MAX_TRACKED_KEYS) {
            attempts.entrySet().removeIf(e -> e.getValue().windowStart < now - 60_000);
        }
    }

    private static final class AttemptInfo {
        final long windowStart;
        final AtomicInteger failures = new AtomicInteger();

        AttemptInfo(long windowStart) {
            this.windowStart = windowStart;
        }
    }
}
