---
title: Loading Initial Data with Spring Boot
summary: CommandLineRunner data seeding, data.sql and schema.sql, Flyway migrations, ApplicationRunner, and profile-specific seeders.
order: 29
minutes: 14
topics: [data-seeding, commandline-runner, flyway, data-sql, application-runner, profiles]
docs:
  - https://docs.spring.io/spring-boot/reference/howto/data-initializers.html
  - https://www.javaguides.net/2022/12/spring-boot-3-tutorial.html
---

# Loading Initial Data with Spring Boot

## Why Load Initial Data?

When you deploy a Spring Boot application, the database is often empty. You need to:

1. **Seed reference data** (roles, categories, config values)
2. **Create an admin user** for the first login
3. **Insert test data** in development
4. **Run migrations** that create schema and populate defaults

There are several ways to do this in Spring Boot.

---

## Method 1: CommandLineRunner (Most Common)

```java
@Component
@Order(1)
public class DataSeeder implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(RoleRepository roleRepository,
                      UserRepository userRepository,
                      PasswordEncoder passwordEncoder) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        // Only seed if the database is empty
        if (roleRepository.count() == 0) {
            seedRoles();
            seedAdminUser();
        }
    }

    private void seedRoles() {
        roleRepository.save(new Role("ADMIN"));
        roleRepository.save(new Role("USER"));
        roleRepository.save(new Role("MODERATOR"));
        System.out.println("✅ Roles seeded: ADMIN, USER, MODERATOR");
    }

    private void seedAdminUser() {
        User admin = new User();
        admin.setEmail("admin@example.com");
        admin.setName("Admin");
        admin.setPassword(passwordEncoder.encode("admin123"));
        admin.setRoles(Set.of(roleRepository.findByName("ADMIN")));
        userRepository.save(admin);
        System.out.println("✅ Admin user created: admin@example.com");
    }
}
```

---

## Method 2: data.sql and schema.sql

Spring Boot automatically runs SQL files from `src/main/resources`:

```sql
-- src/main/resources/data.sql (runs after schema creation)
INSERT INTO roles (name) VALUES ('ADMIN');
INSERT INTO roles (name) VALUES ('USER');
INSERT INTO roles (name) VALUES ('MODERATOR');

INSERT INTO users (email, name, password_hash, role)
VALUES ('admin@example.com', 'Admin', '$2a$10$...', 'ADMIN');
```

```sql
-- src/main/resources/schema.sql (runs first)
CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL
);
```

### Configuration

```yaml
# application.yml
spring:
  sql:
    init:
      mode: always          # always | never | embedded
      schema-locations: classpath:schema.sql
      data-locations: classpath:data.sql
      continue-on-error: true  # Don't fail if data already exists
```

---

## Method 3: Flyway Migrations (Production Best Practice)

Flyway manages database changes version by version:

```sql
-- src/main/resources/db/migration/V1__create_users_table.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- src/main/resources/db/migration/V2__create_orders_table.sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING'
);

-- src/main/resources/db/migration/V3__seed_data.sql
INSERT INTO users (email, name) VALUES ('admin@example.com', 'Admin');
INSERT INTO orders (user_id, total, status) VALUES (1, 99.99, 'COMPLETED');
```

### Configuration

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
```

---

## Method 4: ApplicationRunner (Structured Args)

```java
@Component
public class DevDataLoader implements ApplicationRunner {

    @Value("${app.seed-dev-data:false}")
    private boolean seedDevData;

    private final ProductRepository productRepo;

    public DevDataLoader(ProductRepository productRepo) {
        this.productRepo = productRepo;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (seedDevData || args.containsOption("seed")) {
            seedDevelopmentData();
        }
    }

    private void seedDevelopmentData() {
        List<Product> products = List.of(
            new Product("Laptop", "High-performance laptop", 999.99),
            new Product("Mouse", "Wireless mouse", 29.99),
            new Product("Keyboard", "Mechanical keyboard", 79.99),
            new Product("Monitor", "27-inch 4K monitor", 399.99)
        );
        productRepo.saveAll(products);
        System.out.println("✅ Development data seeded: " + products.size() + " products");
    }
}
```

---

## Method 5: Spring Profiles for Environment-Specific Data

```java
@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    @Override
    public void run(String... args) {
        System.out.println("Loading development data...");
        // Seed lots of test data
    }
}

@Component
@Profile("staging")
public class StagingDataSeeder implements CommandLineRunner {

    @Override
    public void run(String... args) {
        System.out.println("Loading staging data...");
        // Seed minimal reference data
    }
}

@Component
@Profile("prod")
public class ProdDataSeeder implements CommandLineRunner {

    @Override
    public void run(String... args) {
        System.out.println("Loading production data...");
        // Only seed essential roles and admin user
    }
}
```

```bash
# Run with a specific profile
java -jar app.jar --spring.profiles.active=dev
```

---

## Choosing the Right Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| `CommandLineRunner` | Simple seeding | Flexible, Java code | Not version-controlled |
| `data.sql` | Quick SQL inserts | Simple, declarative | No logic, hard to version |
| `Flyway` | Production databases | Versioned, repeatable, rollback | More setup |
| `ApplicationRunner` | CLI argument-based | Can parse arguments | More complex |
| `@Profile` | Environment-specific | Different data per env | Multiple classes to maintain |

---

## In an Organization

### Scenario 1: Multi-Tenant SaaS Application

```java
@Component
@Order(1)
public class TenantInitializer implements CommandLineRunner {

    private final TenantRepository tenantRepo;
    private final DataSource router;

    public TenantInitializer(TenantRepository tenantRepo, DataSource router) {
        this.tenantRepo = tenantRepo;
        this.router = router;
    }

    @Override
    public void run(String... args) {
        List<Tenant> tenants = tenantRepo.findAll();
        for (Tenant tenant : tenants) {
            // Register each tenant's data source
            DataSource ds = createDataSource(tenant);
            router.registerDataSource(tenant.getId(), ds);

            // Run Flyway migrations for each tenant
            Flyway.configure()
                .dataSource(ds)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        }
        System.out.println("✅ Initialized " + tenants.size() + " tenants");
    }
}
```

### Scenario 2: Feature Flags from Database

```java
@Component
@Order(2)
public class FeatureFlagLoader implements CommandLineRunner {

    private final FeatureFlagRepository flagRepo;
    private final FeatureFlagCache cache;

    public FeatureFlagLoader(FeatureFlagRepository flagRepo, FeatureFlagCache cache) {
        this.flagRepo = flagRepo;
        this.cache = cache;
    }

    @Override
    public void run(String... args) {
        List<FeatureFlag> flags = flagRepo.findAll();
        flags.forEach(flag -> cache.setEnabled(flag.getName(), flag.isEnabled()));
        System.out.println("✅ Loaded " + flags.size() + " feature flags");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Running `data.sql` in production | Might insert test data | Use `spring.sql.init.mode=never` in prod |
| Not checking if data exists | Duplicate data on every restart | Check `count()` before inserting |
| Using `data.sql` for complex logic | No branching, no loops | Use `CommandLineRunner` for logic |
| Seeding data before migrations | Table doesn't exist yet | Use `@Order` or Flyway |
| Not using profiles | Same data in all environments | Use `@Profile` for environment-specific data |
| Hardcoding passwords in seed data | Security risk | Use environment variables or config |
