package com.backendforge.academy.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class AppConfig {

    private static final List<String> ALLOWED_METHODS = List.of("GET", "POST", "PUT", "DELETE", "OPTIONS");
    private static final List<String> ALLOWED_HEADERS = List.of("Authorization", "Content-Type", "X-OpenAI-Key");
    private static final List<String> EXPOSED_HEADERS = List.of("Authorization");

    /**
     * CORS for the SPA -- explicit origin allowlist, never wildcard.
     *
     * <p>With {@code allowCredentials=true}, the browser rejects an origin list that
     * contains {@code *}. We additionally validate that the configured origins are concrete
     * HTTPS URLs when the app is running in a non-local environment, so a deployer cannot
     * accidentally widen the allowlist to {@code https://*.vercel.app} or re-enable
     * {@code http://localhost} origins in production.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props, Environment env) {
        List<String> origins = props.cors().allowedOrigins();
        validateOrigins(origins, env);
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(ALLOWED_METHODS);
        cfg.setAllowedHeaders(ALLOWED_HEADERS);
        cfg.setExposedHeaders(EXPOSED_HEADERS);
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L); // preflight cache: 1 hour
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

    /**
     * Logs the resolved origin list at startup and rejects dangerous values in production.
     */
    private void validateOrigins(List<String> origins, Environment env) {
        if (origins == null || origins.isEmpty()) {
            throw new IllegalStateException(
                    "app.cors.allowed-origins must be set (even if only localhost for dev). " +
                    "Empty origin list with allowCredentials=true would block every browser request.");
        }
        for (String o : origins) {
            if (o.trim().equals("*")) {
                throw new IllegalStateException(
                        "app.cors.allowed-origins contains a wildcard ('*'). With " +
                        "allowCredentials=true a wildcard is rejected by browsers and is " +
                        "never correct for this API. Use explicit origins instead.");
            }
        }if (isProductionLike(env)) {
            for (String o : origins) {
                // Any HTTP origin is rejected, which covers localhost/127.0.0.1
                // too — a single rule keeps this from drifting into dead branches.
                if (o.startsWith("http://")) {
                    throw new IllegalStateException(
                            "app.cors.allowed-origins contains a non-TLS origin '" + o
                            + "' in a deployed environment. The API is served over HTTPS; "
                            + "allowing an HTTP origin would let a network attacker impersonate "
                            + "the SPA. Use HTTPS origins only (a localhost origin counts as "
                            + "HTTP and must not be deployed).");
                }
            }
        }
        System.out.println("[AppConfig] CORS allowed origins: " + origins);
    }

    /**
     * Deployed vs. local.
     *
     * <p>Render (and most PaaS providers) inject {@code PORT} to tell the app which
     * port to bind. Some environments — Git Bash on Windows in particular — also
     * export {@code PORT=0}, meaning "pick any free port". Treating that as
     * "deployed" made the CORS guard reject the default localhost dev origins and
     * crashed startup with a misleading security error, so require a real port.
     */
    private boolean isProductionLike(Environment env) {
        String active = env.getProperty("spring.profiles.active");
        // "test" is a test slice, not a production environment — do not reject
        // plain HTTP (http://localhost:3000) or localhost origins during tests.
        if (active != null && (active.contains("test") || active.contains("local"))) {
            return false;
        }
        String port = env.getProperty("PORT");
        if (port == null || port.isBlank()) {
            return false;
        }
        try {
            return Integer.parseInt(port.trim()) > 0;
        } catch (NumberFormatException e) {
            // A non-numeric PORT is not a provider binding hint; stay permissive
            // so a weird local environment cannot lock the app out of booting.
            return false;
        }
    }
}
