---
title: Flyway Database Migrations — Complete Beginner's Guide
summary: Why migration tools exist, how Flyway works, naming conventions, repeatable migrations, and the production checklist.
order: 1
minutes: 20
topics: [flyway, database migration, versioned migrations, repeatable migrations, sql]
docs:
  - https://flywaydb.org/documentation/
  - https://docs.spring.io/spring-boot/reference/howto/data-initialization.html#howto.data-initialization.migration-tool.flyway
---

# Flyway Database Migrations — Complete Beginner's Guide

## Why migration tools exist

**The problem:** Your database schema changes over time. You add a column, create a table, change a constraint. Without a migration tool:

```sql
-- Developer A runs this locally
ALTER TABLE orders ADD COLUMN priority VARCHAR(20);

-- Developer B doesn't know about the change
-- Their app crashes: "column 'priority' doesn't exist"

-- Production? Nobody knows which ALTER TABLEs were run
```

**Flyway's solution:** Every schema change is a **versioned SQL file**. Flyway tracks which migrations have been applied to the database, and runs only the new ones.

```
V1__create_orders_table.sql     ← Applied on day 1
V2__add_customer_column.sql     ← Applied on day 5
V3__add_priority_column.sql     ← Applied today (only this one runs)
```

## How Flyway works

```
1. App starts → Flyway checks the database for a "flyway_schema_history" table
2. Flyway reads the SQL files in classpath: db/migration/
3. Flyway compares file versions with applied versions
4. Flyway runs ONLY the new migrations (in order)
5. Flyway records each applied migration in the history table
```

**Line-by-line Spring Boot configuration:**

```yaml
# application.yml
spring:
  flyway:
    enabled: true                              # Line 1: Enable Flyway (default in Spring Boot)
    locations: classpath:db/migration          # Line 2: Where to find SQL files
    baseline-on-migrate: true                  # Line 3: Create baseline for existing databases
    baseline-version: 0                        # Line 4: Baseline version number
```

## Naming conventions — the rules

Flyway uses strict naming conventions. If you get the name wrong, Flyway ignores the file:

```
db/migration/
├── V1__create_users_table.sql         ← Version 1: create users
├── V2__add_email_column.sql           ← Version 2: add email column
├── V3_1__add_index_on_email.sql       ← Version 3.1: sub-version
├── V4__create_orders_table.sql        ← Version 4: create orders
└── R__create_view_active_users.sql    ← Repeatable: re-runs when content changes
```

**Naming format:**
- `V{version}__{description}.sql` — Versioned (runs once)
- `R__{description}.sql` — Repeatable (re-runs when content changes)
- `__` (double underscore) separates version from description
- `_` (single underscore) in description becomes a space

## Writing migrations

### Versioned migrations — run once

```sql
-- V1__create_users_table.sql
CREATE TABLE users (                                    -- Line 1: Create the table
    id BIGINT AUTO_INCREMENT PRIMARY KEY,               -- Line 2: Primary key
    username VARCHAR(50) NOT NULL UNIQUE,                -- Line 3: Unique username
    email VARCHAR(100) NOT NULL,                         -- Line 4: Email
    password_hash VARCHAR(200) NOT NULL,                 -- Line 5: Hashed password
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP       -- Line 6: Creation timestamp
);
```

```sql
-- V2__add_email_column.sql
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);  -- Line 1: Add a new column
```

### Repeatable migrations — re-runs when content changes

```sql
-- R__create_view_active_users.sql
-- This file re-runs whenever its content changes
-- Use for views, stored procedures, functions

CREATE OR REPLACE VIEW active_users AS                   -- Line 1: Create or replace the view
SELECT id, username, email, display_name                 -- Line 2: Select columns
FROM users                                               -- Line 3: From users table
WHERE deleted_at IS NULL;                                -- Line 4: Only active users
```

**When to use repeatable vs versioned:**
| Type | Use for | When it runs |
|---|---|---|
| **Versioned** | Table changes, column additions, data migrations | Once, in order |
| **Repeatable** | Views, stored procedures, functions | Every time content changes |

## Real-world scenario — e-commerce schema evolution

```sql
-- V1__create_core_tables.sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

```sql
-- V2__add_order_items.sql
CREATE TABLE order_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

```sql
-- V3__add_user_profile.sql
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN bio TEXT;
```

```sql
-- R__create_order_summary_view.sql
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.id AS order_id,
    u.username,
    o.total,
    o.status,
    COUNT(oi.id) AS item_count,
    o.created_at
FROM orders o
JOIN users u ON o.user_id = u.id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, u.username, o.total, o.status, o.created_at;
```

## Flyway in Spring Boot — integration

```java
// Spring Boot auto-configures Flyway — just add SQL files to db/migration/
// But if you need custom configuration:

@Configuration
public class FlywayConfig {
    
    @Bean
    public FlywayMigrationInitializer flywayInitializer(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration", "classpath:db/extra")  // Line 1: Additional locations
            .baselineOnMigrate(true)                                    // Line 2: Baseline existing DB
            .load();
        
        return new FlywayMigrationInitializer(flyway);                 // Line 3: Run on startup
    }
}
```

## The production checklist

- [ ] **Test migrations locally** before pushing — run `mvn flyway:migrate` against a test database
- [ ] **Never modify applied migrations** — Flyway tracks checksums; changes break the history
- [ ] **Use transactions** — most databases support transactional DDL (MySQL doesn't for DDL)
- [ ] **Back up before migrating** — especially for production databases
- [ ] **Use `flyway_schema_history`** — check this table to see what's been applied
- [ ] **Version your migrations** — `V1`, `V2`, `V3` — never reuse version numbers

## Common mistakes

| Mistake | Why it fails | Fix |
|---|---|---|
| Modifying applied migrations | Flyway checksum mismatch error | Create a new migration file |
| Wrong naming convention | Flyway ignores the file | Use `V{version}__{description}.sql` |
| Running migrations in production without testing | Schema breaks in production | Test locally first |
| Mixing Flyway and manual SQL | Flyway history gets out of sync | Use Flyway for ALL schema changes |
| Not backing up before migrate | Data loss if migration fails | Always back up first |

## Key takeaways

- Flyway tracks schema changes as versioned SQL files — only new migrations run
- Versioned (`V{version}__`) for table changes; Repeatable (`R__`) for views/procedures
- Spring Boot auto-configures Flyway — just add SQL files to `db/migration/`
- Never modify applied migrations; always test locally; back up production
- `flyway_schema_history` table tracks what's been applied

**Official docs:** [Flyway Documentation](https://flywaydb.org/documentation/) · [Spring Boot Flyway](https://docs.spring.io/spring-boot/reference/howto/data-initialization.html#howto.data-initialization.migration-tool.flyway)
