---
title: CommandLineRunner & ApplicationRunner
summary: Run code at startup after Spring context loads, ordered runners, conditional execution, data seeding, cache warming, and health checks.
order: 17
minutes: 14
topics: [commandline-runner, application-runner, startup, data-seeding, cache-warming, application-events]
docs:
  - https://docs.spring.io/spring-boot/docs/current/api/org/springframework/boot/CommandLineRunner.html
  - https://docs.spring.io/spring-boot/docs/current/api/org/springframework/boot/ApplicationRunner.html
---

# CommandLineRunner & ApplicationRunner

## What Are They?

When Spring Boot starts your application, it creates all the beans, wires them together, and then... what? Sometimes you need to **run some code once at startup** — like loading initial data, warming a cache, or validating configuration.

**CommandLineRunner** and **ApplicationRunner** are interfaces that let you execute code **after** the Spring context is fully loaded but **before** the application starts accepting requests.

```java
// CommandLineRunner — simple, just takes String[] args
@Component
public class DataLoader implements CommandLineRunner {
    @Override
    public void run(String... args) {
        System.out.println("Application started! Loading initial data...");
        // Your startup code here
    }
}

// ApplicationRunner — richer, uses ApplicationArguments
@Component
public class DataLoader implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        System.out.println("Application started!");
        List<String> nonOptionArgs = args.getNonOptionArgs();
        System.out.println("Non-option args: " + nonOptionArgs);
    }
}
```

---

## CommandLineRunner in Detail

### Basic Usage

```java
@Component
public class StartupInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupInitializer.class);

    @Override
    public void run(String... args) {
        log.info("Application started with {} arguments", args.length);
        for (String arg : args) {
            log.info("  Arg: {}", arg);
        }
    }
}
```

### Multiple Runners with @Order

```java
@Component
@Order(1)
public class DatabaseMigration implements CommandLineRunner {
    @Override
    public void run(String... args) {
        System.out.println("Step 1: Running database migrations...");
        // Run Flyway/Liquibase migrations first
    }
}

@Component
@Order(2)
public class CacheWarmer implements CommandLineRunner {
    @Override
    public void run(String... args) {
        System.out.println("Step 2: Warming cache...");
        // Load hot data into cache after migrations
    }
}

@Component
@Order(3)
public class HealthChecker implements CommandLineRunner {
    @Override
    public void run(String... args) {
        System.out.println("Step 3: Checking dependent services...");
        // Verify database, Redis, etc. are reachable
    }
}
```

### Conditional Execution

```java
@Component
public class DevDataLoader implements CommandLineRunner {

    @Value("${app.dev-mode:false}")
    private boolean devMode;

    @Override
    public void run(String... args) {
        if (devMode) {
            System.out.println("Loading development data...");
            // Only load test data in development
        }
    }
}
```

### With Dependencies (Constructor Injection)

```java
@Component
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    // Spring injects these dependencies before calling run()
    public DataSeeder(UserRepository userRepository, RoleRepository roleRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
    }

    @Override
    public void run(String... args) {
        if (userRepository.count() == 0) {
            System.out.println("Database is empty — seeding initial data...");
            seedRoles();
            seedAdminUser();
        } else {
            System.out.println("Database already has data — skipping seed.");
        }
    }

    private void seedRoles() {
        roleRepository.save(new Role("ADMIN"));
        roleRepository.save(new Role("USER"));
        roleRepository.save(new Role("MODERATOR"));
    }

    private void seedAdminUser() {
        User admin = new User("admin@example.com", "Admin User");
        admin.setRoles(Set.of(roleRepository.findByName("ADMIN")));
        userRepository.save(admin);
    }
}
```

---

## ApplicationRunner in Detail

ApplicationRunner is similar but receives an `ApplicationArguments` object that provides structured access to command-line arguments:

```java
@Component
public class SmartStarter implements ApplicationRunner {

    @Override
    public void run(ApplicationArguments args) {
        // Non-option arguments: "arg1" "arg2"
        System.out.println("Non-option args: " + args.getNonOptionArgs());

        // Option arguments: --name=value --debug
        System.out.println("Option names: " + args.getOptionNames());

        // Get specific option
        if (args.containsOption("profile")) {
            String profile = args.getOptionValues("profile").get(0);
            System.out.println("Profile: " + profile);
        }

        // Check for flags
        if (args.containsOption("debug")) {
            System.out.println("Debug mode enabled!");
        }
    }
}
```

```bash
# Running with arguments
java -jar app.jar --profile=production --debug arg1 arg2

# Output:
# Non-option args: [arg1, arg2]
# Option names: [profile, debug]
# Profile: production
# Debug mode enabled!
```

---

## CommandLineRunner vs ApplicationRunner

| Feature | CommandLineRunner | ApplicationRunner |
|---------|------------------|-------------------|
| Method signature | `run(String... args)` | `run(ApplicationArguments args)` |
| Argument access | Raw String array | Structured (options, non-options) |
| Parsing | Manual | Automatic (`--key=value`, `--flag`) |
| Use case | Simple startup tasks | Need to parse CLI arguments |
| Recommendation | ✅ Most cases | When you need argument parsing |

---

## In an Organization

### Scenario 1: Database Schema Validation

```java
@Component
@Order(1)
public class SchemaValidator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaValidator.class);

    private final JdbcTemplate jdbcTemplate;

    public SchemaValidator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        log.info("Validating database schema...");

        // Check if required tables exist
        List<String> tables = jdbcTemplate.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
            String.class
        );

        List<String> required = List.of("users", "orders", "products", "audit_log");
        for (String table : required) {
            if (!tables.contains(table)) {
                log.error("Missing required table: {}", table);
                throw new IllegalStateException("Database schema is incomplete. Run migrations first.");
            }
        }

        log.info("Schema validation passed — all {} tables present", required.size());
    }
}
```

### Scenario 2: Feature Flag Initialization

```java
@Component
public class FeatureFlagLoader implements CommandLineRunner {

    private final FeatureFlagService featureFlags;
    private final ConfigService configService;

    public FeatureFlagLoader(FeatureFlagService featureFlags, ConfigService configService) {
        this.featureFlags = featureFlags;
        this.configService = configService;
    }

    @Override
    public void run(String... args) {
        log.info("Loading feature flags from config service...");

        Map<String, Boolean> flags = configService.fetchFeatureFlags();
        flags.forEach((flag, enabled) -> {
            featureFlags.setEnabled(flag, enabled);
            log.info("  Feature '{}' is {}", flag, enabled ? "ENABLED" : "DISABLED");
        });

        log.info("Loaded {} feature flags", flags.size());
    }
}
```

### Scenario 3: Cache Warming

```java
@Component
@Order(2)
public class CacheWarmer implements CommandLineRunner {

    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final CacheManager cacheManager;

    public CacheWarmer(ProductRepository productRepo, UserRepository userRepo, CacheManager cacheManager) {
        this.productRepo = productRepo;
        this.userRepo = userRepo;
        this.cacheManager = cacheManager;
    }

    @Override
    public void run(String... args) {
        log.info("Warming caches...");

        // Warm product catalog cache
        List<Product> popularProducts = productRepo.findTop100ByOrderBySalesDesc();
        Cache productCache = cacheManager.getCache("products");
        popularProducts.forEach(p ->
            productCache.put(p.getId(), new CachedProduct(p))
        );
        log.info("Warmed products cache with {} items", popularProducts.size());

        // Warm user session cache
        List<User> activeUsers = userRepo.findLastActiveWithin(Duration.ofDays(7));
        Cache userCache = cacheManager.getCache("users");
        activeUsers.forEach(u ->
            userCache.put(u.getId(), new CachedUser(u))
        );
        log.info("Warmed users cache with {} items", activeUsers.size());
    }
}
```

### Scenario 4: Startup Health Checks

```java
@Component
@Order(3)
public class HealthChecker implements CommandLineRunner {

    private final RedisConnectionFactory redisFactory;
    private final DataSource dataSource;

    public HealthChecker(RedisConnectionFactory redisFactory, DataSource dataSource) {
        this.redisFactory = redisFactory;
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        log.info("Running startup health checks...");

        // Check database
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(5)) {
                log.info("✅ Database: OK");
            }
        } catch (SQLException e) {
            log.error("❌ Database: FAILED - {}", e.getMessage());
            throw new RuntimeException("Database health check failed", e);
        }

        // Check Redis
        try {
            redisFactory.getConnection().ping();
            log.info("✅ Redis: OK");
        } catch (Exception e) {
            log.error("❌ Redis: FAILED - {}", e.getMessage());
            throw new RuntimeException("Redis health check failed", e);
        }

        log.info("All health checks passed!");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Doing heavy work without `@Order` | Runners execute in undefined order | Use `@Order` to control sequence |
| Throwing exceptions in runner | Application fails to start | Catch and log, or use `@ConditionalOnProperty` |
| Not checking if data exists | Duplicate seed data on every restart | Check `count()` before inserting |
| Using `@PostConstruct` instead | `@PostConstruct` runs before all beans are ready | Use `CommandLineRunner` for post-startup tasks |
| Running blocking operations | Delays startup | Keep runners fast or run them async |
| Forgetting `@Component` | Runner never gets picked up | Always annotate with `@Component` |
