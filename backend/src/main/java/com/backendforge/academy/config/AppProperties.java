package com.backendforge.academy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Binds the {@code app.*} configuration block (application.yml) to a typed bean —
 * the idiomatic way to carry your own settings in Spring Boot.
 *
 * @see <a href="https://docs.spring.io/spring-boot/reference/features/external-config.html">Externalized configuration</a>
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, OpenAi openai) {

    public record Jwt(String secret, long expirationSeconds) {}

    public record Cors(List<String> allowedOrigins) {}

    public record OpenAi(String apiKey, String model, String baseUrl, boolean useFreeEndpoint) {}
}
