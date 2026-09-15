package com.backendforge.academy.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Keeps the Render free-tier instance awake by pinging its own public URL.
 *
 * <p>Render spins a free web service down after ~15 idle minutes; the next
 * visitor then waits 30-60s+ for a cold start, which looks like "the backend
 * is broken". GitHub cron keep-alives proved unreliable (scheduled workflows
 * are throttled and run hours apart), so the app now defends itself.
 *
 * <p>Activation is strictly environment-gated: {@code keep-alive.enabled} is
 * {@code true} by default, but the {@code @Scheduled} work is a no-op unless
 * {@code RENDER_EXTERNAL_URL} is set — Render injects that variable into every
 * web service, and local/dev environments never have it. Set
 * {@code keep-alive.enabled=false} to opt out entirely.
 */
@Component
@ConditionalOnProperty(name = "keep-alive.enabled", havingValue = "true", matchIfMissing = true)
public class SelfPingScheduler {

    private static final Logger log = LoggerFactory.getLogger(SelfPingScheduler.class);

    private final String pingUrl;
    private final RestClient rest;

    /** Instrumentation for tests/ops: how many pings fired and the last outcome. */
    private final AtomicInteger pings = new AtomicInteger();
    private final AtomicReference<Instant> lastPingAt = new AtomicReference<>();
    private volatile boolean lastPingOk = true;

    public SelfPingScheduler(
            @Value("${RENDER_EXTERNAL_URL:}") String renderExternalUrl,
            @Value("${keep-alive.path:/api/content/stats}") String pingPath) {
        this.pingUrl = renderExternalUrl.isBlank() ? null : renderExternalUrl + pingPath;
        this.rest = RestClient.create();
        if (pingUrl == null) {
            log.info("Self-ping keep-alive inactive: RENDER_EXTERNAL_URL is not set (expected outside Render).");
        } else {
            log.info("Self-ping keep-alive active: pinging {} every 10 minutes.", pingUrl);
        }
    }

    /** True when the scheduler has a real URL to ping (Render production). */
    public boolean isActive() {
        return pingUrl != null;
    }

    public int getPingCount() {
        return pings.get();
    }

    public Instant getLastPingAt() {
        return lastPingAt.get();
    }

    public boolean isLastPingOk() {
        return lastPingOk;
    }

    /**
     * First run 60s after boot (initializer fixedDelay counts from completion,
     * so every subsequent ping lands ~10 minutes after the previous one).
     */
    @Scheduled(initialDelay = 60_000, fixedDelay = 600_000)
    public void pingSelf() {
        if (pingUrl == null) {
            return;
        }
        pings.incrementAndGet();
        lastPingAt.set(Instant.now());
        try {
            Integer status = rest.get().uri(pingUrl).retrieve().toBodilessEntity().getStatusCode().value();
            lastPingOk = status >= 200 && status < 400;
            if (lastPingOk) {
                log.debug("Self-ping ok: {} -> {}", pingUrl, status);
            } else {
                log.warn("Self-ping got unexpected status {}: {}", status, pingUrl);
            }
        } catch (Exception e) {
            lastPingOk = false;
            // Never propagate: a failed ping must not spam logs or break scheduling.
            log.debug("Self-ping failed (backend may be waking): {}", e.getMessage());
        }
    }
}
