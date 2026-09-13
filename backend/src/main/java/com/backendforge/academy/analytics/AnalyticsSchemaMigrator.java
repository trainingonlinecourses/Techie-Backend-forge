package com.backendforge.academy.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * One-time-safe schema migration for the analytics experiment.
 *
 * <p>{@code ddl-auto: update} never revisits an existing column, so growing
 * {@link AnalyticsEvent.Surface} with IMPRESSION breaks inserts on databases
 * bootstrapped with the old enum — in two different ways:
 *
 * <ul>
 *   <li><b>Postgres</b> (production): Hibernate creates {@code varchar} plus a
 *       CHECK constraint listing the values; the constraint must be dropped.</li>
 *   <li><b>H2 v2</b> (dev): Hibernate maps the enum to H2's native {@code ENUM}
 *       column type, whose allowed-value list must be rebuilt with the new
 *       member ("Value not permitted for column ..." was the live symptom).</li>
 * </ul>
 *
 * <p>Both fixes are derived from {@link AnalyticsEvent.Surface#values()} so they
 * can never go stale, and both are idempotent no-ops on a fresh database.
 * Never throws — a failed migration probe must not block booting.
 */
@Component
@Order(100) // run before anything logs analytics events
public class AnalyticsSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsSchemaMigrator.class);

    private final DataSource dataSource;

    public AnalyticsSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData md = conn.getMetaData();
            String product = md.getDatabaseProductName() == null ? "" : md.getDatabaseProductName();
            if (product.contains("PostgreSQL")) {
                dropPostgresCheckConstraints(conn);
            } else {
                widenH2EnumColumn(conn);
                dropH2CheckConstraints(conn); // older dev DBs may hold varchar + check instead
            }
        } catch (Exception e) {
            log.warn("Analytics schema migration skipped (non-fatal): {}", e.toString());
        }
    }

    /** Postgres: drop CHECK constraints on analytics_events whose definition mentions surface. */
    private void dropPostgresCheckConstraints(Connection conn) throws Exception {
        String sql = """
                select con.conname
                from pg_constraint con
                join pg_class rel on rel.oid = con.conrelid
                where rel.relname = 'analytics_events'
                  and con.contype = 'c'
                  and lower(pg_get_constraintdef(con.oid)) like '%surface%'
                """;
        for (String name : queryList(conn, sql)) {
            exec(conn, "ALTER TABLE analytics_events DROP CONSTRAINT \"" + name + "\"");
            log.info("Analytics migration: dropped stale check constraint {} on surface", name);
        }
    }

    /** H2 v2 native ENUM column: rebuild its value list from the current enum. */
    private void widenH2EnumColumn(Connection conn) throws Exception {
        String typeName;
        String sql = """
                select DATA_TYPE
                from INFORMATION_SCHEMA.COLUMNS
                where TABLE_SCHEMA = SCHEMA()
                  and TABLE_NAME = 'ANALYTICS_EVENTS'
                  and COLUMN_NAME = 'SURFACE'
                """;
        List<String> types = queryList(conn, sql);
        typeName = types.isEmpty() ? "" : types.get(0);
        if (!"ENUM".equalsIgnoreCase(typeName)) return; // varchar column — nothing to rebuild here

        String values = String.join(", ",
                java.util.Arrays.stream(AnalyticsEvent.Surface.values())
                        .map(s -> "'" + s.name() + "'")
                        .toList());
        exec(conn, "ALTER TABLE analytics_events ALTER COLUMN SURFACE SET DATA TYPE ENUM(" + values + ")");
        log.info("Analytics migration: rebuilt H2 ENUM column surface with {} values (added {})",
                AnalyticsEvent.Surface.values().length, AnalyticsEvent.Surface.IMPRESSION);
    }

    /** H2 fallback for varchar+check layouts: drop CHECK constraints mentioning surface. */
    private void dropH2CheckConstraints(Connection conn) throws Exception {
        String sql = """
                select tc.CONSTRAINT_NAME
                from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                join INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                  on cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                 and cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                where tc.TABLE_SCHEMA = SCHEMA()
                  and tc.TABLE_NAME = 'ANALYTICS_EVENTS'
                  and tc.CONSTRAINT_TYPE = 'CHECK'
                  and upper(cc.CHECK_CLAUSE) like '%SURFACE%'
                """;
        for (String name : queryList(conn, sql)) {
            exec(conn, "ALTER TABLE analytics_events DROP CONSTRAINT \"" + name + "\"");
            log.info("Analytics migration: dropped stale check constraint {} on surface", name);
        }
    }

    private List<String> queryList(Connection conn, String sql) throws Exception {
        List<String> out = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(rs.getString(1));
        }
        return out;
    }

    private void exec(Connection conn, String ddl) throws Exception {
        try (Statement st = conn.createStatement()) {
            st.execute(ddl);
        }
    }
}
