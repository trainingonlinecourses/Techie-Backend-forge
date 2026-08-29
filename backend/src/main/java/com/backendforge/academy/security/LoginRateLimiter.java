package com.backendforge.academy.security;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory per-IP rate limiter for the login endpoint.
 * <p>
 * Limits to MAX_ATTEMPTS per LOCKOUT_WINDOW. After that, returns {@code false}
 * for the remainder of the window. This is a lightweight defense — for
 * production with multiple instances, use Redis or Bucket4j.
 */
@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final long LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

    private final ConcurrentHashMap<String, AttemptInfo> attempts = new ConcurrentHashMap<>();

    /**
     * Returns {@code true} if the request is allowed, {@code false} if rate-limited.
     * Also increments the failure counter on {@code recordFailure}.
     */
    public boolean tryAcquire(String key) {
        long now = System.currentTimeMillis();
        AttemptInfo info = attempts.compute(key, (k, existing) -> {
            if (existing == null || (now - existing.windowStart) > LOCKOUT_WINDOW_MS) {
                return new AttemptInfo(now, 1);
            }
            existing.count++;
            return existing;
        });
        return info.count <= MAX_ATTEMPTS;
    }

    /** Returns the number of seconds remaining in the lockout window, or 0 if not locked. */
    public long remainingSeconds(String key) {
        AttemptInfo info = attempts.get(key);
        if (info == null) return 0;
        long elapsed = System.currentTimeMillis() - info.windowStart;
        if (elapsed >= LOCKOUT_WINDOW_MS) return 0;
        return (LOCKOUT_WINDOW_MS - elapsed) / 1000;
    }

    /** Resets the counter (e.g. after a successful login). */
    public void reset(String key) {
        attempts.remove(key);
    }

    private static class AttemptInfo {
        long windowStart;
        int count;

        AttemptInfo(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }
}
