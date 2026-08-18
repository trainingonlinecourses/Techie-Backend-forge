---
title: Graceful Shutdown — Draining Traffic Without Dropping Work
summary: Why hard kills lose requests, how server.shutdown=graceful and lifecycle hooks drain in-flight work, and the org patterns for zero-downtime deploys.
order: 13
minutes: 18
topics: [graceful-shutdown, draining, lifecycle, preDestroy, sigterm, zero-downtime, kubernetes]
docs:
  - https://docs.spring.io/spring-boot/reference/features/graceful-shutdown.html
  - https://docs.spring.io/spring-framework/reference/core/beans/factory-lifecycle.html
---

# Graceful Shutdown — Draining Traffic Without Dropping Work

## The concept: what happens when a deploy kills your instance

When Kubernetes or a deploy script stops a pod, it sends **SIGTERM**. A Spring Boot app that does nothing special **stops accepting new work immediately and exits** — in-flight requests are cut off mid-flight, background jobs die, and a transaction that was mid-commit may be aborted. Users see 502s and dropped payments. **Graceful shutdown** means: stop taking *new* work, let *in-flight* work finish, then exit. Spring Boot supports it with one property:

```properties
server.shutdown=graceful   # Tomcat/Jetty/Netty: stop new connections, drain active ones
spring.lifecycle.timeout-per-shutdown-phase=30s   # how long to wait for draining
```

With this set, on SIGTERM the server **stops accepting new requests**, then gives active requests up to `timeout-per-shutdown-phase` to complete before the JVM exits. That one property eliminates most "requests dropped on deploy" incidents.

## The full shutdown sequence

```text
SIGTERM received
   ↓
web server stops accepting NEW connections/requests
   ↓
in-flight requests drain (up to the timeout)
   ↓
Spring lifecycle hooks run (in reverse creation order):
   @PreDestroy on every bean → close connections, flush buffers, release locks
   ↓
JVM exits (or waits for non-daemon threads)
```

`@PreDestroy` is where your beans do their cleanup — and it's the inverse of `@PostConstruct`:

```java
@Component
public class MessagePoller {
    private ExecutorService workers;
    private volatile boolean running = true;

    @PostConstruct
    public void start() {
        workers = Executors.newFixedThreadPool(4);
        for (int i = 0; i < 4; i++) workers.submit(this::pollLoop);
    }

    @PreDestroy
    public void stop() {
        running = false;                       // signal loops to stop pulling new work
        workers.shutdown();                    // stop accepting tasks
        try {
            workers.awaitTermination(10, TimeUnit.SECONDS);  // drain in-flight messages
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void pollLoop() {
        while (running) {
            Message m = queue.receive();       // on shutdown: stop receiving, finish current
            if (m != null) handle(m);
        }
    }
}
```

The pattern — a **volatile flag + `shutdown()` + `awaitTermination`** — is the standard way to make any executor-based worker drain cleanly instead of dropping the message it was processing.

## How we use it in an organization: the scenarios

**Scenario 1 — Kubernetes-friendly deploys.** K8s sends SIGTERM, then SIGKILL after `terminationGracePeriodSeconds` (default 30s). Match the pieces:

```yaml
# deployment.yaml
spec:
  terminationGracePeriodSeconds: 45   # must exceed spring.lifecycle.timeout-per-shutdown-phase
```

Set `server.shutdown=graceful`, keep the lifecycle timeout (say 30s) *under* the pod grace period (45s), and rolling deploys stop losing requests.

**Scenario 2 — draining long-running HTTP work.** A report endpoint that streams for minutes shouldn't be killed at 30s — raise the drain window for that path or move long work to a background job the app can complete before exit.

**Scenario 3 — message consumer shutdown.** Kafka/Rabbit consumers follow the same discipline: on shutdown, stop polling, commit the last offset *after* the current message is processed (Spring's `@KafkaListener` does this automatically with `autoStartup` + graceful container stop).

**Scenario 4 — connection pools and caches.** `@PreDestroy` on a `DataSource` closes the Hikari pool (releasing connections back to the database instead of leaking them); on a `CacheManager` flushes dirty entries. Spring Boot's own infrastructure beans already do this — your job is the *custom* workers and pools.

## The gaps graceful shutdown does NOT cover

- **Kubernetes pre-stop hooks:** the pod may still receive traffic while draining unless the readiness probe fails first. Standard setup: a readiness probe endpoint that the k8s `preStop` hook flips to "not ready" *before* SIGTERM — so the load balancer stops routing new requests, then the app drains. This is the **readiness-first** pattern.
- **Long transactions:** if a transaction exceeds the drain window it gets rolled back — the timeout is a cap, not a guarantee.
- **Non-daemon threads you create yourself** will block JVM exit — use `@PreDestroy` + `awaitTermination` so they stop before the JVM tries to exit.

## Pitfalls

- Graceful shutdown **delays exit** — orchestrators kill with SIGKILL after their grace period, so a drain window longer than the orchestrator's is pointless (and causes hard kills anyway).
- Tests: shutdown hooks fire on context close in tests too — keep them idempotent and fast.
- `Thread.sleep` loops that ignore `InterruptedException` never drain — always propagate/restore the interrupt.

## Key takeaways

- `server.shutdown=graceful` + a lifecycle timeout drains in-flight requests on SIGTERM.
- Coordinate with the orchestrator: drain window < pod termination grace period.
- Use readiness probes + preStop so no *new* traffic arrives while draining.
- Drain custom workers with flag + `shutdown()` + `awaitTermination` in `@PreDestroy`.
- Graceful shutdown is a cap, not a guarantee — design idempotent consumers so interrupted work can resume.
