package com.backendforge.academy.config;

import com.zaxxer.hikari.HikariDataSource;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Manual smoke test: connects to a real Postgres (e.g. Supabase) using the exact
 * same HikariCP configuration the production app uses (DatabaseConfig.dataSource),
 * runs a few probe queries, and prints what it finds.
 *
 * Run from backend/:
 *   mvn -q test-compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
 *   DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
 *     java -cp "target/classes;target/test-classes;$(cat target/cp.txt)" \
 *     com.backendforge.academy.config.SupabaseConnectionChecker
 *
 * (Windows cmd: replace \ with ^ and $(cat ...) is unavailable — pass the classpath
 * with semicolons manually, or run from Git Bash as above.)
 *
 * Exit code 0 = connected and probed OK, 1 = failed (prints the reason).
 */
public final class SupabaseConnectionChecker {

    public static void main(String[] args) throws Exception {
        String url = args.length > 0 ? args[0] : System.getenv("DATABASE_URL");
        if (url == null || url.isBlank()) {
            System.err.println("""
                    No DATABASE_URL given. Export one first, e.g. (Supabase pooled, transaction mode):
                      export DATABASE_URL='postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres'
                    or the direct connection:
                      export DATABASE_URL='postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres'""");
            System.exit(1);
        }

        System.out.println("Testing DATABASE_URL (host part only): " +
                url.replaceAll("//[^@]*@", "//<credentials>@"));

        DatabaseConfig config = new DatabaseConfig();
        try (HikariDataSource ds = (HikariDataSource) config.dataSource(envWith(url))) {
            System.out.println("Hikari pool configured: jdbcUrl=" + ds.getJdbcUrl()
                    + ", maxPoolSize=" + ds.getMaximumPoolSize());

            try (Connection conn = ds.getConnection();
                 Statement st = conn.createStatement()) {

                System.out.println("✅ Connection acquired (login OK).");

                try (ResultSet rs = st.executeQuery(
                        "select version(), current_database(), current_user")) {
                    if (rs.next()) {
                        System.out.println("Postgres : " + rs.getString(1).split(",")[0]);
                        System.out.println("Database : " + rs.getString(2));
                        System.out.println("User     : " + rs.getString(3));
                    }
                }

                try (ResultSet rs = st.executeQuery(
                        "select count(*) from information_schema.tables where table_schema='public'")) {
                    if (rs.next()) {
                        System.out.println("Public tables: " + rs.getInt(1));
                    }
                }

                System.out.println("✅ Pooled connection verified end-to-end.");
            }
        } catch (Exception e) {
            System.err.println("❌ Connection failed: " + e.getMessage());
            if (e.getMessage() != null && e.getMessage().contains("password authentication failed")) {
                System.err.println("   → Password wrong, or special characters (@ : / # ?) are not URL-encoded.");
            }
            if (e.getMessage() != null && e.getMessage().contains("Connection refused")) {
                System.err.println("   → Host/port unreachable. Check the Supabase host, port (6543 pooler / 5432 direct) and IP restrictions.");
            }
            System.exit(1);
        }
    }

    private static org.springframework.mock.env.MockEnvironment envWith(String url) {
        org.springframework.mock.env.MockEnvironment env = new org.springframework.mock.env.MockEnvironment();
        env.setProperty("DATABASE_URL", url);
        return env;
    }
}
