package com.backendforge.academy.security;

import com.backendforge.academy.config.AppProperties;
import com.backendforge.academy.user.User;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

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

    public JwtService(AppProperties props) {
        this.props = props;
        SecretKey key = new SecretKeySpec(
                props.jwt().secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        JWKSource<SecurityContext> jwkSource = new ImmutableSecret<>(key);
        this.encoder = new NimbusJwtEncoder(jwkSource);
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
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
