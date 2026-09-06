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
        }
        if (isProductionLike(env)) {
            for (String o : origins) {
                if (o.startsWith("http://")) {
                    throw new IllegalStateException(
                            "app.cors.allowed-origins contains an HTTP (non-TLS) origin '" + o +
                            "' in a nonlocal environment. The API is served over HTTPS; " +
                            "allowing an HTTP origin would let a network attacker impersonate " +
                            "the SPA. Use HTTPS origins only.");
                }
                if (o.startsWith("http://localhost") || o.startsWith("http://127.0.0.1")) {
                    throw new IllegalStateException(
                            "app.cors.allowed-origins contains a localhost/127.0.0.1 origin '" + o +
                            "' in a nonlocal environment. Dev origins must not be reachable " +
                            "from production browsers.");
                }
            }
        }
        System.out.println("[AppConfig] CORS allowed origins: " + origins);
    }

    private boolean isProductionLike(Environment env) {
        String active = env.getProperty("spring.profiles.active");
        // "test" is a test slice, not a production environment — do not reject
        // plain HTTP (http://localhost:3000) or localhost origins during tests.
        if (active != null && (active.contains("test") || active.contains("local"))) {
            return false;
        }
        return env.getProperty("PORT") != null;
    }
}
