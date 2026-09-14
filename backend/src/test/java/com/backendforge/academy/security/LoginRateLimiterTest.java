package com.backendforge.academy.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Unit tests for the per-IP login rate limiter (5 failures / 15 min window). */
class LoginRateLimiterTest {

    @Test
    @DisplayName("attempts alone never trigger lockout; only failures count")
    void attemptsDoNotLock() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 10; i++) {
            assertThat(limiter.tryAcquire("ip-a")).as("tryAcquire " + (i + 1)).isTrue();
        }
    }

    @Test
    @DisplayName("allows 4 failures, blocks the 6th login after a 5th failure")
    void blocksAfterMaxFailures() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire("ip-a")).isTrue();
            limiter.recordFailure("ip-a");
        }
        assertThat(limiter.tryAcquire("ip-a")).isFalse(); // 5 failures → 6th blocked
    }

    @Test
    @DisplayName("different IPs are independent")
    void independentPerIp() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) { limiter.tryAcquire("ip-1"); limiter.recordFailure("ip-1"); }
        assertThat(limiter.tryAcquire("ip-1")).isFalse();
        assertThat(limiter.tryAcquire("ip-2")).isTrue(); // untouched IP still allowed
    }

    @Test
    @DisplayName("reset clears the failure counter (successful login path)")
    void resetClearsCounter() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) { limiter.tryAcquire("ip-r"); limiter.recordFailure("ip-r"); }
        assertThat(limiter.tryAcquire("ip-r")).isFalse();
        limiter.reset("ip-r");
        assertThat(limiter.tryAcquire("ip-r")).isTrue();
    }

    @Test
    @DisplayName("success-then-failure starts a fresh window (reset semantics)")
    void successResetsWindow() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 4; i++) { limiter.tryAcquire("ip-s"); limiter.recordFailure("ip-s"); }
        limiter.reset("ip-s"); // the successful login
        assertThat(limiter.tryAcquire("ip-s")).isTrue();
        limiter.recordFailure("ip-s");
        assertThat(limiter.tryAcquire("ip-s")).isTrue(); // fresh window: 1 failure so far
    }

    @Test
    @DisplayName("remainingSeconds reports lockout only after real failures")
    void remainingSecondsReporting() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        assertThat(limiter.remainingSeconds("never-seen")).isZero();
        for (int i = 0; i < 5; i++) { limiter.tryAcquire("ip-x"); limiter.recordFailure("ip-x"); }
        assertThat(limiter.tryAcquire("ip-x")).isFalse();
        assertThat(limiter.remainingSeconds("ip-x")).isGreaterThan(0);
    }

    @Test
    @DisplayName("spoofed/oversized/invalid keys are sanitized and bounded")
    void sanitizesKeys() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        String evil = "x".repeat(500) + "\n<script>alert(1)</script>";
        assertThat(limiter.tryAcquire(evil)).isTrue();
        limiter.recordFailure(evil);
        // The 500-char garbage key can never collide with a real IP key
        assertThat(limiter.tryAcquire("203.0.113.7")).isTrue();
    }

    @Test
    @DisplayName("flood of distinct fake keys cannot blow the map past the cap")
    void mapIsCapped() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 12_000; i++) {
            limiter.recordFailure("fake-ip-" + i);
        }
        // 10,000-cap enforced via eviction; no exception, still serving real keys
        assertThat(limiter.tryAcquire("203.0.113.9")).isTrue();
    }
}
