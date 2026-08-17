package com.backendforge.academy.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URISyntaxException;

/**
 * Hosting-platform persistence.
 *
 * <p>Render and Railway inject a Postgres connection string as the
 * {@code DATABASE_URL} environment variable ({@code postgres://…} or {@code postgresql://…}),
 * which Spring Boot cannot consume directly. When that variable is present we build the JDBC
 * DataSource from it — so user registrations, progress and chat history live in Postgres and
 * survive web-service redeploys. Locally (no {@code DATABASE_URL}) the app keeps using the
 * zero-setup H2 file database configured in {@code application.yml}.
 */
@Configuration
public class DatabaseConfig {

    @Bean
    @ConditionalOnProperty(name = "DATABASE_URL")
    DataSource dataSource(Environment env) throws URISyntaxException {
        URI uri = new URI(env.getProperty("DATABASE_URL"));
        // Render and Railway both use postgres:// in their docs, but Render has been
        // observed injecting postgresql:// — accept either scheme.
        String scheme = uri.getScheme();
        if (!("postgres".equalsIgnoreCase(scheme) || "postgresql".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException("Unsupported DATABASE_URL scheme: " + scheme);
        }

        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = uri.getPath() == null || uri.getPath().isBlank() ? "" : uri.getPath();
        String query = uri.getQuery() == null ? "" : "?" + uri.getQuery();

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl("jdbc:postgresql://" + uri.getHost() + ":" + port + path + query);
        String[] creds = uri.getUserInfo() == null ? new String[0] : uri.getUserInfo().split(":", 2);
        if (creds.length > 0) ds.setUsername(creds[0]);
        if (creds.length > 1) ds.setPassword(creds[1]);
        return ds;
    }
}
