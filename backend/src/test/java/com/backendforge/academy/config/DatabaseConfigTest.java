package com.backendforge.academy.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies DATABASE_URL parsing for every format a provider hands you — most
 * importantly Supabase's pooler host (port 6543, PgBouncer transaction pooling)
 * and passwords that contain special characters (must be percent-encoded in the
 * URL and are decoded here).
 */
class DatabaseConfigTest {

    private final DatabaseConfig config = new DatabaseConfig();

    private HikariDataSource dataSource(MockEnvironment env) throws Exception {
        return (HikariDataSource) config.dataSource(env);
    }

    @Test
    @DisplayName("Supabase pooled URL (port 6543, pooler host) → jdbc URL, credentials, small pool")
    void supabasePooledUrl() throws Exception {
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "postgresql://postgres.abcdefghijk:SupaPass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"));

        assertThat(ds.getJdbcUrl()).isEqualTo(
                "jdbc:postgresql://aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
        assertThat(ds.getUsername()).isEqualTo("postgres.abcdefghijk");
        assertThat(ds.getPassword()).isEqualTo("SupaPass");
        // Transaction-mode PgBouncer: keep the client pool small.
        assertThat(ds.getMaximumPoolSize()).isEqualTo(5);
        ds.close();
    }

    @Test
    @DisplayName("Direct Supabase URL (db.<ref>.supabase.co:5432) → default pool size 10")
    void supabaseDirectUrl() throws Exception {
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "postgresql://postgres:SupaPass@db.abcdefghijk.supabase.co:5432/postgres"));

        assertThat(ds.getJdbcUrl()).isEqualTo(
                "jdbc:postgresql://db.abcdefghijk.supabase.co:5432/postgres");
        assertThat(ds.getMaximumPoolSize()).isEqualTo(10);
        ds.close();
    }

    @Test
    @DisplayName("URL-encoded password with special characters is percent-decoded")
    void encodedPasswordIsDecoded() throws Exception {
        // Real Supabase passwords frequently contain @ : / # ?
        // e.g. password "p@ss:word/1" must appear as p%40ss%3Aword%2F1 in the URL.
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "postgresql://postgres.abcdefghijk:p%40ss%3Aword%2F1@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"));

        assertThat(ds.getPassword()).isEqualTo("p@ss:word/1");
        ds.close();
    }

    @Test
    @DisplayName("Pre-built jdbc: URL is accepted as-is (query params preserved)")
    void jdbcPrefixedUrl() throws Exception {
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "jdbc:postgresql://db.abcdefghijk.supabase.co:5432/postgres?sslmode=require&prepareThreshold=0"));

        assertThat(ds.getJdbcUrl()).isEqualTo(
                "jdbc:postgresql://db.abcdefghijk.supabase.co:5432/postgres?sslmode=require&prepareThreshold=0");
        ds.close();
    }

    @Test
    @DisplayName("Query params (sslmode, prepareThreshold) pass through on postgres:// URLs too")
    void queryParametersPassThrough() throws Exception {
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "postgres://postgres:pw@db.abcdefghijk.supabase.co:5432/postgres?sslmode=require"));

        assertThat(ds.getJdbcUrl()).endsWith("/postgres?sslmode=require");
        ds.close();
    }

    @Test
    @DisplayName("Missing port falls back to 5432")
    void defaultPort() throws Exception {
        HikariDataSource ds = (HikariDataSource) config.dataSource(env(
                "postgresql://postgres:pw@db.abcdefghijk.supabase.co/postgres"));

        assertThat(ds.getJdbcUrl()).isEqualTo("jdbc:postgresql://db.abcdefghijk.supabase.co:5432/postgres");
        ds.close();
    }

    @Test
    @DisplayName("Non-postgres scheme is rejected with a clear message")
    void rejectsOtherSchemes() throws Exception {
        assertThatThrownBy(() -> config.dataSource(env("mysql://user:pw@host:3306/db")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mysql");
    }

    private MockEnvironment env(String databaseUrl) {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("DATABASE_URL", databaseUrl);
        return env;
    }
}
