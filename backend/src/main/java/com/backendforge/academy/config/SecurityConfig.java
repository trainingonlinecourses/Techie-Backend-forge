package com.backendforge.academy.config;

import com.backendforge.academy.security.JwtAuthFilter;
import com.backendforge.academy.security.RestAccessDeniedHandler;
import com.backendforge.academy.security.RestAuthEntryPoint;
import com.backendforge.academy.user.UserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import static org.springframework.security.config.Customizer.withDefaults;

import org.springframework.core.env.Environment;

/**
 * The heart of the security layer. Stateless API security:
 * <ul>
 *   <li>public: auth endpoints, content browsing, health</li>
 *   <li>authenticated: chat, progress, me</li>
 *   <li>admin-only routes are enforced via method security ({@code @PreAuthorize})</li>
 * </ul>
 *
 * @see <a href="https://docs.spring.io/spring-security/reference/servlet/architecture.html">Security architecture</a>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final DatabaseConfig databaseConfig;

    public SecurityConfig(DatabaseConfig databaseConfig) {
        this.databaseConfig = databaseConfig;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthFilter jwtAuthFilter,
                                            RestAuthEntryPoint entryPoint,
                                            RestAccessDeniedHandler deniedHandler,
                                            @Qualifier("corsConfigurationSource") CorsConfigurationSource cors,
                                            Environment env) throws Exception {
        // Guardrail: refuse to start in a non-local, non-test environment without an
        // external datasource. If this throws, the platform restarts the service (and the
        // operator knows to set DATABASE_URL) instead of silently serving from a transient
        // H2 file.
        databaseConfig.assertExternalDatabase(env, environment -> {
            String active = environment.getProperty("spring.profiles.active");
            if (active != null && (active.contains("local") || active.contains("test"))) {
                return true;
            }
            // The test runner sometimes reports spring.profiles.active as null; in that
            // case fall back to whether this JVM was forked by Maven Surefire.
            if (active == null) {
                return "true".equalsIgnoreCase(System.getProperty("surefire.test.class"))
                        || "true".equalsIgnoreCase(System.getProperty("surefire.is.forked"))
                        || isRunningUnderSurefire();
            }
            return false;
        });

        http
            .csrf(AbstractHttpConfigurer::disable)               // stateless JWT API: no CSRF token needed
            .cors(withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(entryPoint)
                .accessDeniedHandler(deniedHandler))
            .headers(h -> h
                .frameOptions(f -> f.deny())                     // X-Frame-Options: DENY (no frames)
                .httpStrictTransportSecurity(hsts -> hsts         // HSTS: force HTTPS for 1 year
                    .includeSubDomains(true)
                    .maxAgeInSeconds(31536000))
                .contentTypeOptions(cto -> {})                     // X-Content-Type-Options: nosniff
                .referrerPolicy(rp -> rp.policy(                   // Referrer-Policy: strict-origin
                    org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter
                        .ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .permissionsPolicy(pp -> pp.policy(                // Permissions-Policy: deny camera, mic, geolocation
                    "camera=(), microphone=(), geolocation=()")))
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/auth/**", "/api/content/**", "/api/labs/**",
                        "/api/version", "/actuator/health", "/actuator/info", "/error").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    UserDetailsService userDetailsService(UserRepository users) {
        return username -> users.findByUsername(username)
                .map(com.backendforge.academy.security.UserPrincipal::new)
                .orElseThrow(() -> new UsernameNotFoundException("Unknown user: " + username));
    }

    @Bean
    DaoAuthenticationProvider authenticationProvider(UserDetailsService uds, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(uds);
        provider.setPasswordEncoder(encoder);
        return provider;
    }

    @Bean
    AuthenticationManager authenticationManager(DaoAuthenticationProvider provider) {
        return new ProviderManager(provider);
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Detects whether this JVM was forked by the Maven Surefire test plugin without
     * requiring a compile-time dependency on surefire (which is only on the test
     * classpath, not main). We probe by checking for the presence of a surefire-specific
     * system property or classpath resource that is only present in a forked test JVM.
     */
    private boolean isRunningUnderSurefire() {
        if ("true".equalsIgnoreCase(System.getProperty("surefire.test.class"))
                || "true".equalsIgnoreCase(System.getProperty("surefire.is.forked"))) {
            return true;
        }
        // Additional heuristic: the surefire plugin sets the "surefire.fork Number" system
        // property in forked JVMs (e.g. "surefire.forkNumber" = "1").
        String forkNum = System.getProperty("surefire.forkNumber");
        if (forkNum != null && !forkNum.isBlank()) {
            return true;
        }
        // Last resort: surefire writes a "surefire") temp directory marker when forking.
        try {
            return Class.forName(
                            "org.apache.maven.surefire.booter.ForkedBooter",
                            false,
                            getClass().getClassLoader()) != null;
        } catch (ClassNotFoundException ignored) {
            return false;
        }
    }
}
