const fs = require('fs');
const c = fs.readFileSync('src/main/java/com/backendforge/academy/config/DatabaseConfig.java', 'utf8');

// Replace the multi-line throw message with a single clean line.
const oldBlock = [
  '        if (env.getProperty("DATABASE_URL") == null) {',
  '            throw new IllegalStateException(',
  '                    "No DATABASE_URL configured for a non-local environment. The application " +',
  '                    "refuses to run against the default H2 file database in production because " +',
  '                    "data would be lost on every restart. Inject a Postgres connection string " +',
  '                    "as DATABASE_URL (Render, Railway, ...)."',
  '            );',
  '        }'
].join('\n');

const newBlock = [
  '        if (env.getProperty("DATABASE_URL") == null) {',
  '            throw new IllegalStateException(',
  '                    "No DATABASE_URL configured for this non-local environment. The application " +',
  '                    "refuses to start against the default H2 file database because user data " +',
  '                    "(registrations, progress, chat history) would be lost on every restart. " +',
  '                    "Set DATABASE_URL to a Postgres connection string in the hosting platform."',
  '            );',
  '        }'
].join('\n');

if (c.includes(oldBlock)) {
  const out = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/main/java/com/backendforge/academy/config/DatabaseConfig.java', out, 'utf8');
  console.log('replaced multi-line message');
} else {
  console.log('old block not found — writing known-good version');
  const knownGood = `package com.backendforge.academy.config;

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
    @ConditionalOnProperty(name = "DATABASE_URL")
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
     * Fails the startup when the app is running in a non-local environment without an
     * external datasource. A free-tier web service backed by the default H2 file database
     * loses every registration, progress entry and chat message on the next restart, so we
     * refuse to start in that configuration and let the platform restart with the correct
     * DATABASE_URL instead.
     */
    public void assertExternalDatabase(Environment env) {
        if (isLocal(env)) {
            return;
        }
        if (env.getProperty("DATABASE_URL") == null) {
            throw new IllegalStateException(
                    "No DATABASE_URL configured for this non-local environment. The application " +
                    "refuses to start against the default H2 file database because user data " +
                    "(registrations, progress, chat history) would be lost on every restart. " +
                    "Set DATABASE_URL to a Postgres connection string in the hosting platform.");
        }
    }

    private boolean isLocal(Environment env) {
        String active = env.getProperty("spring.profiles.active");
        if (active != null && active.contains("local")) {
            return true;
        }
        // A hosting platform that injects PORT is not local dev.
        return env.getProperty("PORT") == null;
    }
}
`;
  fs.writeFileSync('src/main/java/com/backendforge/academy/config/DatabaseConfig.java', knownGood, 'utf8');
  console.log('wrote known-good version');
}
