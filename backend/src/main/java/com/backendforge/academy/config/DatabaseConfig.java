package com.backendforge.academy.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URISyntaxException;

@Configuration
public class DatabaseConfig {

    @Bean
    @ConditionalOnProperty(name = "DATABASE_URL", havingValue = "true", matchIfMissing = false)
    DataSource dataSource(Environment env) throws URISyntaxException {
        URI uri = new URI(env.getProperty("DATABASE_URL"));
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

    /**
     * Fails the startup when the app is running in a non-local, non-test environment
     * without an external datasource. A free-tier web service backed by the default H2
     * file database loses every registration, progress entry and chat message on the next
     * restart, so we refuse to start in that configuration and let the platform restart
     * with the correct DATABASE_URL instead. The "test" profile is excluded so CI can run
     * fast integration tests against an in-memory H2 database.
     *
     * @param env the Spring Environment
     * @param isLocal a predicate that decides whether this environment is local/test
     */
    public void assertExternalDatabase(Environment env, java.util.function.Function<Environment, Boolean> isLocal) {
        if (isLocal.apply(env)) {
            return;
        }
        if (env.getProperty("DATABASE_URL") == null) {
            throw new IllegalStateException(
                    "No DATABASE_URL configured for this non-local environment. The application " +
                    "refuses to start against the default H2 file database because user data " +
                    "(registrations, progress, chat history) would be lost on every restart. " +
                    "Set DATABASE_URL to a Postgres connection string in the hosting platform. " +
                    "(active profile: '" + env.getProperty("spring.profiles.active") + "')");
        }
    }

    private boolean isLocal(Environment env) {
        String active = env.getProperty("spring.profiles.active");
        // "test" is a test slice — allow H2 for fast CI/test runs.
        if (active != null && (active.contains("local") || active.contains("test"))) {
            return true;
        }
        return false;
    }
}
