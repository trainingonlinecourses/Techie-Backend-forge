package com.backendforge.academy.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Unit tests for the per-IP login rate limiter (5 attempts / 15 min window). */
class LoginRateLimiterTest {

    @Test
    @DisplayName("allows 5 attempts, blocks the 6th")
    void blocksAfterMaxAttempts() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire("ip-a")).as("attempt " + (i + 1)).isTrue();
        }
        assertThat(limiter.tryAcquire("ip-a")).isFalse(); // 6th blocked
    }

    @Test
    @DisplayName("different IPs are independent")
    void independentPerIp() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) limiter.tryAcquire("ip-1");
        assertThat(limiter.tryAcquire("ip-1")).isFalse();
        assertThat(limiter.tryAcquire("ip-2")).isTrue(); // untouched IP still allowed
    }

    @Test
    @DisplayName("reset clears the counter (successful login path)")
    void resetClearsCounter() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 5; i++) limiter.tryAcquire("ip-r");
        assertThat(limiter.tryAcquire("ip-r")).isFalse();
        limiter.reset("ip-r");
        assertThat(limiter.tryAcquire("ip-r")).isTrue();
    }

    @Test
    @DisplayName("remainingSeconds reports lockout while blocked, 0 when unknown")
    void remainingSecondsReporting() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        assertThat(limiter.remainingSeconds("never-seen")).isZero();
        for (int i = 0; i < 5; i++) limiter.tryAcquire("ip-x");
        assertThat(limiter.remainingSeconds("ip-x")).isGreaterThan(0);
    }
}
