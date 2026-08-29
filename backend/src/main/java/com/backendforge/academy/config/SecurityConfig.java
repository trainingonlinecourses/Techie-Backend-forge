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

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthFilter jwtAuthFilter,
                                            RestAuthEntryPoint entryPoint,
                                            RestAccessDeniedHandler deniedHandler,
                                            @Qualifier("corsConfigurationSource") CorsConfigurationSource cors) throws Exception {
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
                .requestMatchers("/api/auth/**", "/api/content/**", "/actuator/health",
                        "/error").permitAll()
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
}
