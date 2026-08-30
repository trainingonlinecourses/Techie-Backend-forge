---
title: Stable Values — Lazy, Thread-Safe, One-Time Computation
summary: What stable values are, how they differ from lazy initialization, thread safety, and how organizations use them for expensive computations.
order: 2
minutes: 20
topics: [stable-values, lazy-initialization, thread-safety, jep469, java25]
docs:
  - https://openjdk.org/jeps/469
---

## The Concept, From Zero

Sometimes you want to compute a value **once**, lazily, and cache it forever. Before Java 25, this required manual synchronization:

```java
// OLD: Double-checked locking — verbose and error-prone
private volatile ExpensiveObject cached;

public ExpensiveObject getExpensiveObject() {
    if (cached == null) {
        synchronized (this) {
            if (cached == null) {
                cached = new ExpensiveObject();  // expensive computation
            }
        }
    }
    return cached;
}

// OLD: Simpler but not thread-safe
private ExpensiveObject cached;

public ExpensiveObject getExpensiveObject() {
    if (cached == null) {
        cached = new ExpensiveObject();  // race condition!
    }
    return cached;
}
```

Java 25 introduces **stable values** — a clean, thread-safe way to compute and cache a value exactly once:

```java
// JAVA 25: Clean, thread-safe, lazy
private final StableValue<ExpensiveObject> cached =
    StableValue.of(() -> new ExpensiveObject());

public ExpensiveObject getExpensiveObject() {
    return cached.get();  // computed on first call, cached forever
}
```

---

## How It Works

```java
import java.lang.StableValue;

// Create a stable value with lazy computation
StableValue<String> greeting = StableValue.of(() -> {
    System.out.println("Computing greeting...");  // only runs once
    return "Hello, World!";
});

// First call — computes and caches
System.out.println(greeting.get());  // prints "Computing greeting..." then "Hello, World!"

// Second call — returns cached value (no recomputation)
System.out.println(greeting.get());  // prints "Hello, World!" (no "Computing..." message)
```

---

## Line-by-Line Walkthrough

```java
import java.lang.StableValue;
import java.util.*;
import java.util.concurrent.*;

public class StableValuesDemo {
    // Line 1: Basic stable value — expensive computation
    private static final StableValue<Map<String, String>> configCache =
        StableValue.of(() -> {
            System.out.println("Loading configuration from disk...");
            // Simulate expensive I/O
            Thread.sleep(100);
            return Map.of(
                "db.url", "jdbc:postgresql://localhost:5432/mydb",
                "db.pool", "10",
                "cache.ttl", "300"
            );
        });

    // Line 2: Stable value for expensive data structure
    private static final StableValue<List<String>> allowedRoles =
        StableValue.of(() -> {
            System.out.println("Loading allowed roles...");
            return List.of("ADMIN", "USER", "MODERATOR", "GUEST");
        });

    // Line 3: Stable value with validation
    private static final StableValue<Integer> maxConnections =
        StableValue.of(() -> {
            int max = Integer.parseInt(
                System.getProperty("db.maxConnections", "100")
            );
            if (max <= 0) throw new IllegalStateException("maxConnections must be positive");
            return max;
        });

    // Line 4: Stable value for thread-safe singleton
    private static final StableValue<ExecutorService> executor =
        StableValue.of(() -> Executors.newVirtualThreadPerTaskExecutor());

    public static void main(String[] args) throws Exception {
        // Line 5: First access — triggers computation
        System.out.println("First access:");
        Map<String, String> config = configCache.get();
        System.out.println("Config: " + config);

        // Line 6: Second access — cached, no recomputation
        System.out.println("\nSecond access:");
        Map<String, String> config2 = configCache.get();
        System.out.println("Same instance? " + (config == config2));  // true

        // Line 7: Allowed roles
        System.out.println("\nRoles: " + allowedRoles.get());
        System.out.println("Contains ADMIN? " + allowedRoles.get().contains("ADMIN"));

        // Line 8: Max connections
        System.out.println("Max connections: " + maxConnections.get());

        // Line 9: Thread safety — multiple threads compute only once
        ExecutorService exec = executor.get();
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            futures.add(exec.submit(() -> {
                // All threads get the same stable value
                return Thread.currentThread().getName();
            }));
        }
        System.out.println("Thread names: " + futures.stream()
            .map(f -> { try { return f.get(); } catch (Exception e) { return "?"; } })
            .toList());
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Database connection pool

```java
public class DatabasePool {
    private final StableValue<HikariDataSource> dataSource =
        StableValue.of(() -> {
            var config = new HikariConfig();
            config.setJdbcUrl("jdbc:postgresql://localhost:5432/mydb");
            config.setUsername("user");
            config.setPassword("pass");
            config.setMaximumPoolSize(10);
            return new HikariDataSource(config);
        });

    public Connection getConnection() throws SQLException {
        return dataSource.get().getConnection();
    }
}
```

### Scenario 2: Feature flags

```java
public class FeatureFlags {
    private final StableValue<Map<String, Boolean>> flags =
        StableValue.of(() -> loadFlagsFromConfig());

    public boolean isEnabled(String feature) {
        return flags.get().getOrDefault(feature, false);
    }

    private Map<String, Boolean> loadFlagsFromConfig() {
        // Load from remote config service
        return Map.of(
            "dark-mode", true,
            "beta-features", false,
            "new-checkout", true
        );
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using for mutable state | Stable values are immutable | Use volatile + synchronization for mutable |
| Forgetting the computation is lazy | Value computed on first .get() | Design for lazy evaluation |
| Using where multiple values needed | StableValue is single-value | Use a cache or ConcurrentHashMap |
| Overusing for simple values | Overkill for constants | Use static final fields for compile-time constants |
