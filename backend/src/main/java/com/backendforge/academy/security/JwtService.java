package com.backendforge.academy.security;

import com.backendforge.academy.config.AppProperties;
import com.backendforge.academy.user.User;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

import org.springframework.core.env.Environment;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Stateless token issuing/validation using the Nimbus JOSE library
 * (brought in by {@code spring-boot-starter-oauth2-jose}).
 *
 * <p>HS256 with a shared secret. In a real deployment use RS256 with a proper
 * keypair and externalize the key via {@code APP_JWT_SECRET}.
 */
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final AppProperties props;

    public JwtService(AppProperties props, Environment env) {
        this.props = props;
        String secret = props.jwt().secret();
        boolean isLocal = isLocal(env);
        if (secret == null) {
            throw new IllegalStateException(
                    "APP_JWT_SECRET is not set. The application cannot issue or validate JWTs " +
                    "without a secret. Set APP_JWT_SECRET to a random value of at least 32 " +
                    "characters in the hosting platform's environment variables.");
        }
        if (secret.length() < 32) {
            throw new IllegalStateException(
                    "APP_JWT_SECRET must be at least 32 characters. Current length: " + secret.length() +
                    (isLocal ? " (local dev — set a longer secret to avoid this message)" : ""));
        }
        // Detect the well-known dev default so a production deploy that forgets to override
        // it is loud rather than silently forging verifiable tokens with a published secret.
        if (!isLocal && "backendforge-academy-dev-secret-change-me-0123456789".equals(secret)) {
            System.err.println("[JwtService] WARNING: APP_JWT_SECRET is still the documented dev default. " +
                    "Set APP_JWT_SECRET to a random value in the hosting platform for this environment.");
        }
        SecretKey key = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        JWKSource<SecurityContext> jwkSource = new ImmutableSecret<>(key);
        this.encoder = new NimbusJwtEncoder(jwkSource);
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    private boolean isLocal(Environment env) {
        String active = env.getProperty("spring.profiles.active");
        if (active != null && active.contains("local")) {
            return true;
        }
        return env.getProperty("PORT") == null;
    }

    public String issue(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("backendforge-academy")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(props.jwt().expirationSeconds()))
                .subject(user.getUsername())
                .claim("uid", user.getId())
                .claim("role", user.getRole().name())
                .build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    /** Returns the subject (username) if the token is valid, else null. */
    public String subject(String token) {
        try {
            return decoder.decode(token).getSubject();
        } catch (JwtException e) {
            return null;
        }
    }
}
