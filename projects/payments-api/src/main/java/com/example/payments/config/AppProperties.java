package com.example.payments.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt) {

    public record Jwt(String secret, long expirationSeconds) {}
}
