package com.backendforge.academy.security;

import com.backendforge.academy.config.AppProperties;
import com.backendforge.academy.user.Role;
import com.backendforge.academy.user.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for JWT issuing and validation — real Nimbus encoder/decoder,
 * no Spring context. Covers the properties users care about: round-trip,
 * tamper rejection, expiry and the secrets guardrails.
 */
class JwtServiceTest {

    private static final String SECRET_32 = "unit-test-secret-0123456789abcdef0123";

    private JwtService serviceWith(String secret, MockEnvironment env) {
        var props = new AppProperties(new AppProperties.Jwt(secret, 3600),
                new AppProperties.Cors(java.util.List.of("https://example.com")),
                new AppProperties.OpenAi("k", "m", "http://localhost", false));
        return new JwtService(props, env);
    }

    private User user() {
        User u = new User();
        u.setUsername("jwtuser");
        u.setDisplayName("JWT User");
        u.setRole(Role.USER);
        // JwtService puts user.getId() into the "uid" claim; Nimbus rejects null
        // claim values, so simulate what JPA would have assigned:
        org.springframework.test.util.ReflectionTestUtils.setField(u, "id", 42L);
        return u;
    }

    @Test
    @DisplayName("issue → subject() round-trips the username; tampered token rejected")
    void issueAndReadRoundTrip() {
        JwtService svc = serviceWith(SECRET_32, new MockEnvironment());
        String token = svc.issue(user());

        assertThat(svc.subject(token)).isEqualTo("jwtuser");
        // flipping one character invalidates the signature
        String tampered = token.substring(0, token.length() - 4) + "AAAA";
        assertThat(svc.subject(tampered)).isNull();
    }

    @Test
    @DisplayName("token signed with a different secret is rejected")
    void foreignSecretRejected() {
        JwtService a = serviceWith(SECRET_32, new MockEnvironment());
        JwtService b = serviceWith("another-secret-0123456789abcdefghij", new MockEnvironment());

        String token = a.issue(user());
        assertThat(b.subject(token)).isNull();
    }

    @Test
    @DisplayName("expired token → subject() returns null")
    void expiredTokenRejected() {
        // The encoder refuses to issue a token with exp < iat, so craft a genuinely
        // expired JWT with Nimbus directly (same HMAC secret, exp 30 min in the past —
        // beyond Nimbus' ~60s clock-skew tolerance) and assert the decoder rejects it.
        JwtService svc = serviceWith(SECRET_32, new MockEnvironment());
        try {
            var claims = new com.nimbusds.jwt.JWTClaimsSet.Builder()
                    .issuer("backendforge-academy")
                    .subject("jwtuser")
                    .issueTime(java.util.Date.from(java.time.Instant.now().minusSeconds(3600)))
                    .expirationTime(java.util.Date.from(java.time.Instant.now().minusSeconds(1800)))
                    .build();
            var signed = new com.nimbusds.jwt.SignedJWT(
                    new com.nimbusds.jose.JWSHeader(com.nimbusds.jose.JWSAlgorithm.HS256), claims);
            signed.sign(new com.nimbusds.jose.crypto.MACSigner(SECRET_32));

            assertThat(svc.subject(signed.serialize())).isNull();
        } catch (com.nimbusds.jose.JOSEException e) {
            throw new AssertionError("failed to craft expired token", e);
        }
    }

    @Test
    @DisplayName("guardrail: null secret refuses startup")
    void nullSecretFailsFast() {
        MockEnvironment env = new MockEnvironment();
        assertThatThrownBy(() -> serviceWith(null, env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_JWT_SECRET is not set");
    }

    @Test
    @DisplayName("guardrail: short secret refuses startup")
    void shortSecretFailsFast() {
        assertThatThrownBy(() -> serviceWith("short", new MockEnvironment()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 32 characters");
    }
}
