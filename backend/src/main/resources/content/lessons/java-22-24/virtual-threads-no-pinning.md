---
title: Java 24 — Synchronized Virtual Threads & AOT Loading (JEP 491, 483)
summary: Java 24 removes the last big virtual-thread footgun — synchronized blocks no longer "pin" carrier threads — and Ahead-of-Time class loading cuts startup time. Virtual threads are now truly production-ready.
order: 4
minutes: 10
topics: [Java 24, JEP 491, JEP 483, Virtual Threads, Performance]
docs:
  - url: https://openjdk.org/jeps/491
    title: JEP 491 — Synchronize Virtual Threads without Pinning
capstone: false
---

## The idea in one sentence

Virtual threads (Java 21) promised a million cheap threads — but `synchronized` blocks **pinned** them to their carrier thread, quietly destroying scalability. **Java 24 (JEP 491)** fixes that, and **JEP 483** makes startup faster by loading classes ahead of time.

## What this code does — step by step

1. A virtual thread is cheap: you create it with `Thread.ofVirtual()`, and the JVM schedules it on a few real "carrier" threads.
2. Before Java 24, entering a `synchronized` block *pinned* the virtual thread to its carrier — blocking I/O inside `synchronized` froze a whole carrier thread.
3. After Java 24, `synchronized` no longer pins: the JVM can unmount the virtual thread while it waits, exactly like it always did for lock-free code.
4. The lesson code simulates a server handling many "requests" with virtual threads and a shared counter — the pattern that used to be the footgun.

```java
import java.time.Duration;

public class VirtualThreadsDemo {

    static final Object LOCK = new Object();
    static int served = 0;

    public static void main(String[] args) throws Exception {
        // 1. Launch 10_000 virtual threads — on plain threads this would blow memory.
        var threads = new java.util.ArrayList<Thread>();
        for (int i = 1; i <= 10_000; i++) {
            threads.add(Thread.ofVirtual().start(() -> {
                try {
                    Thread.sleep(Duration.ofMillis(1)); // simulated I/O wait
                } catch (InterruptedException _) { }
                // 2. synchronized is SAFE on virtual threads as of Java 24 (JEP 491):
                //    no pinning, carriers stay free. Pre-24, this pattern throttled throughput.
                synchronized (LOCK) {
                    served++;
                }
            }));
        }

        // 3. Wait for all of them, then report.
        for (Thread t : threads) t.join();
        System.out.println("Step 1: served " + served + " requests with 10,000 virtual threads");
        System.out.println("Step 2: synchronized no longer pins carriers (Java 24+)");

        // 4. How to check pinning yourself: -Djdk.tracePinnedThreads=full (pre-24) —
        //    on 24+ this flag is gone because pinning from synchronized is gone.
    }
}
```

## Why this matters

- **Spring Boot 3.2+ with `spring.threads.virtual.enabled=true`**: every request runs on a virtual thread. Before Java 24, one `synchronized` block in a hot path silently serialized your whole app.
- **JEP 483 (AOT class loading)**: the JVM caches a loaded-and-linked snapshot of your app's classes and reloads it on the next start — JPA/Hibernate-heavy apps start noticeably faster, which matters a lot on platforms that wake your service on demand.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Assuming `synchronized` is still a problem on 24+ | Unnecessary refactors to ReentrantLock | Pinning from synchronized is fixed — keep it simple |
| Calling `Thread.sleep` to "block" intentionally | Fine now — virtual threads unmount during sleep | Prefer sleep/delay over busy-wait loops |
| Pooling virtual threads | Wastes their purpose; they're cheap | Create as many as you need, pool only scarce resources (like JDBC connections) |

## Try it yourself

Bump the loop to 100,000 threads and watch it still run; then add a second `synchronized` method that also increments and confirm the count is exactly 200,000. Run with **Ctrl+Enter** — the simulator supports virtual-thread-style code by running it sequentially, so the logic is verifiable in the browser.

## References

- [OpenJDK — JEP 491](https://openjdk.org/jeps/491)
- [dev.java — the official OpenJDK site](https://dev.java/)
- [inside.java — the Java team at Oracle](https://inside.java/)
