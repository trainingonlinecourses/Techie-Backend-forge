---
title: Stable Values — Lazy, Thread-Safe, Single-Assignment Variables
summary: The StableValue API provides a thread-safe, lazy, single-assignment variable that's cheaper than volatile fields and safer than double-checked locking.
order: 5
minutes: 18
topics: [stable-values, value-classes, lazy-initialization, thread-safety]
docs:
  - https://openjdk.org/jeps/477
---

## The Concept, From Zero

In Java, when you want a value that's computed once and then never changes, you have several options — but all of them have problems:

- **Final field**: Must be set in the constructor, can't be lazy
- **Volatile field**: Thread-safe but every read goes to main memory (slow)
- **Double-checked locking**: Thread-safe, lazy, but easy to get wrong
- **Supplier memoize**: Works but creates garbage objects

A StableValue is like a sealed envelope. Once you put a value in, it can never be changed, and reading it is as fast as reading a final field — no synchronization overhead.

## The Code

```java
import jdk.incubator.concurrent.StableValue;

public class ConfigManager {

    // Thread-safe, lazy, single-assignment
    private final StableValue<DatabaseConfig> config =
        StableValue.of();

    public DatabaseConfig getConfig() {
        // First call computes and caches; subsequent calls return cached value
        return config.orElseSet(() -> {
            System.out.println("Loading config (only once!)");
            return DatabaseConfig.loadFromEnv();
        });
    }

    // Compare with traditional approaches:
    private volatile DatabaseConfig volatileConfig;

    // Traditional double-checked locking (verbose, error-prone)
    public DatabaseConfig getVolatileConfig() {
        if (volatileConfig == null) {
            synchronized (this) {
                if (volatileConfig == null) {
                    volatileConfig = DatabaseConfig.loadFromEnv();
                }
            }
        }
        return volatileConfig;
    }
}
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `StableValue.of()` | Creates an empty stable value | Initially unset; can be set exactly once |
| `config.orElseSet(() -> ...)` | Set if empty, then return | Thread-safe: only one thread computes the value |
| `volatile DatabaseConfig` | Volatile field comparison | Volatile works but is slower for reads |
| `synchronized` block | Traditional lazy init | Verbose, easy to forget the inner null check |

## Real-World Scenarios

**Scenario 1: Lazy database connection pool**
```java
private final StableValue<ConnectionPool> pool = StableValue.of();

public Connection getConnection() {
    return pool.orElseSet(() -> ConnectionPool.create(
        config.getUrl(), config.getUsername(), config.getPassword()
    )).getConnection();
}
```

**Scenario 2: Feature flag checked on every request**
```java
private final StableValue<Boolean> featureEnabled =
    StableValue.of();

public boolean isFeatureEnabled() {
    return featureEnabled.orElseSet(() ->
        featureFlagService.isEnabled("new-checkout-flow")
    );
}
```

## Key Takeaways

1. **StableValue replaces double-checked locking** — same semantics, 10x less code
2. **Reads are as fast as final fields** — no volatile overhead after initialization
3. **Thread-safe by design** — the JVM handles the synchronization internally
4. **Use for truly immutable values** — once set, it can never change
5. **Preview feature** — may change based on feedback
