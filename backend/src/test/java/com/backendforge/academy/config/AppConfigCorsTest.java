package com.backendforge.academy.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * CORS origin allowlist validation.
 *
 * <p>The guard has to be strict when deployed (an HTTP origin would let a network
 * attacker impersonate the SPA) while staying out of the way on a developer
 * machine. The two requirements collided on a real bug: {@code PORT} was treated
 * as proof of a hosted deployment, but shells such as Git Bash on Windows export
 * {@code PORT=0} on their own. That made the app believe it was in production,
 * reject the default localhost dev origins, and crash on startup with a
 * misleading security error. These tests pin both halves of that contract.
 */
class AppConfigCorsTest {

    private final AppConfig config = new AppConfig();

    private AppProperties props(String originsCsv) {
        List<String> origins = originsCsv.isBlank()
                ? List.of()
                // Mirrors how Spring binds the comma-separated YAML value.
                : List.of(originsCsv.split(",")).stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        return new AppProperties(null, new AppProperties.Cors(origins), null);
    }

    /** A deployed Render-style environment. */
    private MockEnvironment deployed() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("PORT", "10000");
        return env;
    }

    @Test
    @DisplayName("REGRESSION: PORT=0 must NOT be treated as a deployed environment")
    void portZeroIsNotDeployed() {
        // Git Bash exports PORT=0 meaning "pick any free port". Treating that as
        // production crashed local startup on the default localhost origins.
        MockEnvironment env = new MockEnvironment();
        env.setProperty("PORT", "0");

        assertThatCode(() -> config.corsConfigurationSource(
                props("http://localhost:5173,http://127.0.0.1:5173"), env))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("A blank or non-numeric PORT is not a deploy signal either")
    void unusablePortIsNotDeployed() {
        MockEnvironment blank = new MockEnvironment();
        blank.setProperty("PORT", "   ");
        assertThatCode(() -> config.corsConfigurationSource(
                props("http://localhost:5173"), blank)).doesNotThrowAnyException();

        MockEnvironment garbage = new MockEnvironment();
        garbage.setProperty("PORT", "not-a-port");
        assertThatCode(() -> config.corsConfigurationSource(
                props("http://localhost:5173"), garbage)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Deployed: an HTTP origin is rejected with an actionable message")
    void deployedRejectsHttpOrigin() {
        assertThatThrownBy(() -> config.corsConfigurationSource(
                props("https://techie-backend-forge.vercel.app,http://localhost:5173"), deployed()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non-TLS origin")
                .hasMessageContaining("http://localhost:5173");
    }

    @Test
    @DisplayName("Deployed: a localhost origin is rejected (it is HTTP, so one rule covers both)")
    void deployedRejectsLocalhostOrigin() {
        // Previously a second, separate branch tried to handle this — but it was
        // unreachable dead code, because the plain "http://" check above already
        // threw for every HTTP origin including localhost.
        assertThatThrownBy(() -> config.corsConfigurationSource(
                props("http://127.0.0.1:5173"), deployed()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non-TLS origin");
    }

    @Test
    @DisplayName("Deployed: HTTPS origins are accepted")
    void deployedAcceptsHttpsOrigins() {
        assertThatCode(() -> config.corsConfigurationSource(
                props("https://techie-backend-forge.vercel.app"), deployed()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("A wildcard is rejected everywhere — credentials + wildcard is always wrong")
    void wildcardAlwaysRejected() {
        for (MockEnvironment env : List.of(deployed(), new MockEnvironment())) {
            assertThatThrownBy(() -> config.corsConfigurationSource(props("*"), env))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("wildcard");
        }
    }

    @Test
    @DisplayName("An empty allowlist is rejected, not silently accepted")
    void emptyAllowlistRejected() {
        MockEnvironment env = new MockEnvironment();
        assertThatThrownBy(() -> config.corsConfigurationSource(props(""), env))
                .isInstanceOf(IllegalStateException.class);
    }
}