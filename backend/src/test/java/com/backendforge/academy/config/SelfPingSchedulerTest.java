package com.backendforge.academy.config;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the self-ping keep-alive gating: inactive without
 * RENDER_EXTERNAL_URL, active with one, and failures never propagate.
 */
class SelfPingSchedulerTest {

    private HttpServer server;

    private String startServer(int status) throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        AtomicInteger hits = new AtomicInteger();
        server.createContext("/api/content/stats", exchange -> {
            hits.incrementAndGet();
            byte[] body = "{\"modules\":118}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
        return "http://localhost:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    @DisplayName("Without RENDER_EXTERNAL_URL the scheduler is inactive; ping is a harmless no-op")
    void inactiveWithoutRenderUrl() {
        SelfPingScheduler scheduler = new SelfPingScheduler("", "/api/content/stats");

        assertThat(scheduler.isActive()).isFalse();

        scheduler.pingSelf();

        assertThat(scheduler.getPingCount()).isZero();
        assertThat(scheduler.getLastPingAt()).isNull();
        assertThat(scheduler.isLastPingOk()).isTrue();
    }

    @Test
    @DisplayName("With RENDER_EXTERNAL_URL the scheduler pings its own stats endpoint")
    void pingsRenderExternalUrl() throws IOException {
        String base = startServer(200);

        SelfPingScheduler scheduler = new SelfPingScheduler(base, "/api/content/stats");

        assertThat(scheduler.isActive()).isTrue();

        scheduler.pingSelf();

        assertThat(scheduler.getPingCount()).isEqualTo(1);
        assertThat(scheduler.isLastPingOk()).isTrue();
    }

    @Test
    @DisplayName("A failing self-ping is swallowed and recorded, never thrown")
    void failedPingIsSwallowed() throws IOException {
        String base = startServer(500);

        SelfPingScheduler scheduler = new SelfPingScheduler(base, "/api/content/stats");

        scheduler.pingSelf();

        assertThat(scheduler.getPingCount()).isEqualTo(1);
        assertThat(scheduler.isLastPingOk()).isFalse();
    }
}
