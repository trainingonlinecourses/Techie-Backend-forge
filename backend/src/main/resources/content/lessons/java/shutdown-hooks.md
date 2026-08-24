---
title: Shutdown Hooks — Graceful Cleanup When the JVM Exits
summary: Runtime.addShutdownHook, orderly shutdown sequences, signal handling, why shutdown hooks are NOT guarantees, and how Spring Boot hooks into this lifecycle for graceful drain.
order: 46
minutes: 16
topics: [shutdown-hook, addShutdownHook, graceful-shutdown, signal-handler, jvm-lifecycle, spring-shutdown]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/Runtime.html#addShutdownHook-java.lang.Thread-
  - https://docs.oracle.com/javase/8/docs/api/java/lang/Runtime.html#removeShutdownHook-java.lang.Thread-
---

# Shutdown Hooks — Graceful Cleanup When the JVM Exits

## The concept

A **shutdown hook** is a thread that the JVM runs before it terminates. You register one with `Runtime.getRuntime().addShutdownHook(thread)`. When the JVM receives a termination signal (Ctrl+C, `System.exit()`, SIGTERM, logoff), it runs all registered hooks in an unspecified order.

Shutdown hooks are for **cleanup** — flushing buffers, closing database connections, releasing file locks, deregistering from service discovery. They are NOT for:
- Preventing shutdown (you cannot cancel `System.exit()`).
- Long-running work (the JVM will force-kill after a timeout).
- Guaranteeing execution (SIGKILL or power loss skips hooks entirely).

## The shutdown signal sequence

When the JVM receives a shutdown signal:

1. The system initiates an orderly shutdown.
2. All **finalizers** run (if any objects override `finalize()` — deprecated since Java 9).
3. All registered **shutdown hooks** run concurrently (not sequentially).
4. If a hook throws, the JVM may skip remaining hooks.
5. After hooks complete (or timeout), the JVM exits.

```java
public class Application {

    public static void main(String[] args) {
        DatabasePool pool = new DatabasePool();
        MessageBroker broker = new MessageBroker();

        // Register cleanup hooks
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("Shutting down message broker...");
            broker.stop();
        }));

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("Closing database pool...");
            pool.close();
        }));

        // Start the application
        pool.init();
        broker.start();
        startServer(pool, broker);
    }
}
```

**Order is NOT guaranteed.** Hooks run concurrently in separate threads. If broker depends on the database being available during shutdown, you need explicit ordering within the hooks.

## Ordering shutdown hooks

```java
public class ShutdownManager {

    private final List<Runnable> shutdownActions = new CopyOnWriteArrayList<>();

    public void register(Runnable action) {
        shutdownActions.add(action);
    }

    public void init() {
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown));
    }

    private void shutdown() {
        // Run in reverse registration order — last registered shuts down first
        List<Runnable> reversed = new ArrayList<>(shutdownActions);
        Collections.reverse(reversed);

        for (Runnable action : reversed) {
            try {
                action.run();
            } catch (Exception e) {
                System.err.println("Shutdown hook failed: " + e.getMessage());
            }
        }
    }
}
```

```java
ShutdownManager manager = new ShutdownManager();

manager.register(() -> messageBroker.stop());      // registered 1st, shutdown 2nd
manager.register(() -> databasePool.close());       // registered 2nd, shutdown 1st

manager.init();
```

## System.exit() and hooks

```java
public static void main(String[] args) {
    Runtime.getRuntime().addShutdownHook(new Thread(() -> {
        System.out.println("Hook running");  // THIS WILL execute
    }));

    System.out.println("Before exit");
    System.exit(0);  // triggers hooks, then JVM exits
    System.out.println("After exit");  // NEVER reached
}
```

`System.exit(0)` triggers orderly shutdown (hooks run). `System.halt(0)` forces immediate termination (hooks are skipped).

## How we use it in organizations

### Scenario 1: Spring Boot graceful shutdown

Spring Boot registers its own shutdown hooks to:

1. Stop accepting new HTTP requests.
2. Wait for in-flight requests to complete (configurable timeout).
3. Destroy Spring beans in reverse dependency order.
4. Close the embedded web server.

```yaml
# application.yml
server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

When Kubernetes sends SIGTERM, Spring:
1. Receives the signal.
2. Marks the pod as "not ready" (if readiness probe is configured).
3. Waits up to 30 seconds for in-flight requests.
4. Destroys beans in order.

### Scenario 2: deregister from service discovery

```java
@Component
public class ServiceRegistryHook {

    private final ServiceDiscoveryClient discoveryClient;

    public ServiceRegistryHook(ServiceDiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    @PreDestroy
    public void deregister() {
        // Deregister before the JVM shuts down
        // so load balancers stop sending traffic
        discoveryClient.deregister();
        System.out.println("Deregistered from service discovery");
    }
}
```

### Scenario 3: flushing audit logs

```java
@Component
public class AuditFlushHook {

    private final AuditLogBuffer buffer;

    @PreDestroy
    public void flush() {
        System.out.println("Flushing " + buffer.size() + " pending audit entries...");
        buffer.flush();
        System.out.println("Audit logs flushed");
    }
}
```

## Spring @PreDestroy vs shutdown hooks

Spring's `@PreDestroy` is NOT a shutdown hook. It runs during Spring's context close, which happens inside a shutdown hook. The order is:

1. JVM receives SIGTERM.
2. JVM runs shutdown hooks.
3. Spring's shutdown hook calls `context.close()`.
4. Spring destroys beans (calling `@PreDestroy` methods).
5. Spring stops the embedded server.

```java
@Component
public class MyService {

    @PreDestroy
    public void cleanup() {
        // Runs during Spring context shutdown (step 4 above)
        // Database connections are still available here
        // But HTTP server is still running
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Assuming hook execution order | Broker shuts down before DB is flushed |
| Doing long work in a hook | JVM force-kills after timeout |
| Using hooks for business logic | Skipped on SIGKILL, power loss |
| Not registering hooks for external resources | Leaked connections, corrupted files |
| Relying on hooks for data durability | No guarantee on force-kill |
