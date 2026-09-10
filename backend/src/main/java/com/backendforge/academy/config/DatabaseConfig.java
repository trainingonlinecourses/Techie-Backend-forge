package com.backendforge.academy.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;

@Configuration
public class DatabaseConfig {

    /**
     * Builds the Hikari pool from DATABASE_URL. Supported formats (all work with
     * Supabase, Render Postgres, Railway, Neon, ...):
     * <ul>
     *   <li>{@code postgresql://user:password@host:6543/postgres} — what Supabase's
     *       "Connection string" panel gives you (port 6543 = PgBouncer transaction
     *       pooler, 5432 = direct/session).</li>
     *   <li>{@code postgres://...} — equivalent scheme, also accepted.</li>
     *   <li>{@code jdbc:postgresql://user@host:5432/postgres} — pre-built JDBC URL;
     *       used as-is (the userinfo part is parsed the same way).</li>
     * </ul>
     * The password must be URL-encoded in DATABASE_URL (Supabase passwords often
     * contain {@code @ : / # ?}); it is decoded here before being handed to the driver.
     * Query parameters ({@code ?sslmode=require&prepareThreshold=0...}) are passed
     * through to the PostgreSQL JDBC driver untouched.
     */
    @Bean
    @ConditionalOnProperty(name = "DATABASE_URL", havingValue = "true", matchIfMissing = false)
    DataSource dataSource(Environment env) throws URISyntaxException {
        String raw = env.getProperty("DATABASE_URL").trim();

        // Tolerate a pre-built JDBC URL: strip "jdbc:" so the rest parses like a normal URL.
        String toParse = raw.startsWith("jdbc:") ? raw.substring("jdbc:".length()) : raw;
        URI uri = new URI(toParse);

        String scheme = uri.getScheme();
        if (!("postgres".equalsIgnoreCase(scheme) || "postgresql".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException(
                    "Unsupported DATABASE_URL scheme: " + scheme
                    + " (expected postgresql://user:password@host:port/db)");
        }

        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = uri.getPath() == null || uri.getPath().isBlank() ? "" : uri.getPath();
        String query = uri.getQuery() == null ? "" : "?" + uri.getQuery();

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl("jdbc:postgresql://" + uri.getHost() + ":" + port + path + query);

        String[] creds = uri.getUserInfo() == null ? new String[0] : uri.getUserInfo().split(":", 2);
        if (creds.length > 0) ds.setUsername(urlDecode(creds[0]));
        if (creds.length > 1) ds.setPassword(urlDecode(creds[1]));

        // Supabase's pooler (host like aws-0-<region>.pooler.supabase.com, port 6543)
        // fronts PgBouncer in transaction mode: each connection returns to the pool
        // after every transaction, so a large client-side pool exhausts the small
        // free-tier server pool. Keep the client pool modest; the pooler multiplexes.
        boolean viaPgBouncer = uri.getHost() != null && uri.getHost().contains("pooler.supabase.com");
        ds.setMaximumPoolSize(viaPgBouncer ? 5 : 10);
        ds.setMinimumIdle(1);
        // Fail fast (and surface a clear error) instead of hanging the health check
        // when the database is unreachable — important on platforms that restart on
        // failed health checks.
        ds.setConnectionTimeout(15_000);
        return ds;
    }

    private static String urlDecode(String value) {
        if (value == null) return null;
        // Percent-decoding is a no-op for strings without '%', so this is always safe.
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
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
