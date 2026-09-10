---
title: Phaser, CountDownLatch & CyclicBarrier — Thread Coordination
summary: When threads need to synchronize at specific points, barrier-based coordination, phased computation, and production patterns for parallel processing.
order: 6
minutes: 18
topics: [phaser, countDownLatch, cyclicBarrier, thread-coordination, barrier, parallel-processing, phased-computation]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/Phaser.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/CountDownLatch.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/CyclicBarrier.html
---

# Phaser, CountDownLatch & CyclicBarrier — Thread Coordination

## Why Coordinate Threads?

Sometimes threads need to **wait for each other** at specific points:
- "Wait until ALL workers finish before reporting results"
- "Start processing ONLY AFTER all data is loaded"
- "Process in waves — each wave waits for the previous to finish"

Java provides three tools for this:

| Tool | Reusable? | Use When |
|------|-----------|----------|
| **CountDownLatch** | ❌ One-shot | Wait for N events to complete |
| **CyclicBarrier** | ✅ Reusable | Threads wait for each other at a point |
| **Phaser** | ✅ Reusable + Dynamic | Complex phased computations |

---

## CountDownLatch — One-Shot Wait

### Basic Usage


**What this code does — step by step:**

1. "Wait until 3 tasks complete"
2. `CountDownLatch latch = new CountDownLatch(3);` — Count = 3
3. Worker threads count down when done
4. `doWork();` — Do some work
5. `latch.countDown();` — Decrement count
6. `latch.countDown();` — Still count down on error
7. Main thread waits until count reaches 0
8. `latch.await();` — Blocks until all 3 workers call countDown()

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        CountDownLatch latch = new CountDownLatch(3);

        ExecutorService executor = Executors.newFixedThreadPool(3);

        for (int i = 0; i < 3; i++) {
            executor.submit(() -> {
                try {
                    doWork();
                    latch.countDown();
                } catch (Exception e) {
                    latch.countDown();
                }
            });
        }

        latch.await();
        System.out.println("All workers finished!");
    }
}
```

### Real Example: Parallel API Calls

@Service
public class MultiSourceAggregator {

    public AggregatedResult aggregateFromSources(String id) {
        CountDownLatch latch = new CountDownLatch(3);
        AtomicReference<User> user = new AtomicReference<>();
        AtomicReference<List<Order>> orders = new AtomicReference<>();
        AtomicReference<Profile> profile = new AtomicReference<>();

        // Fire 3 API calls in parallel
        executor.submit(() -> {
            try {
                user.set(userClient.getUser(id));
            } finally {
                latch.countDown();
            }
        });

        executor.submit(() -> {
            try {
                orders.set(orderClient.getOrders(id));
            } finally {
                latch.countDown();
            }
        });

        executor.submit(() -> {
            try {
                profile.set(profileClient.getProfile(id));
            } finally {
                latch.countDown();
            }
        });

        // Wait for all to complete
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        return new AggregatedResult(user.get(), orders.get(), profile.get());
    }
}

---

## CyclicBarrier — Reusable Synchronization Point

### Basic Usage


**What this code does — step by step:**

1. "4 threads must all reach this point before any can proceed"
2. Runs ONCE when all threads arrive
3. Each thread does some work, then waits at the barrier
4. `doPhase1Work();` — Each thread does its part
5. `barrier.await();` — Wait for others
6. `doPhase2Work();` — All start phase 2 together

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        CyclicBarrier barrier = new CyclicBarrier(4, () -> {
            System.out.println("All threads reached the barrier!");
        });

        for (int i = 0; i < 4; i++) {
            executor.submit(() -> {
                doPhase1Work();
                barrier.await();
                doPhase2Work();
            });
        }
    }
}
```

### Real Example: Parallel Data Processing

public class ParallelProcessor {

    private final CyclicBarrier barrier;
    private final List<DataSource> sources;

    public ParallelProcessor(List<DataSource> sources) {
        this.sources = sources;
        this.barrier = new CyclicBarrier(sources.size());
    }

    public void processInPhases() {
        sources.forEach(source -> {
            new Thread(() -> {
                try {
                    // Phase 1: Each source loads its data
                    List<Data> data = source.loadData();

                    // Wait for all sources to finish loading
                    barrier.await();

                    // Phase 2: All process together (after barrier)
                    processBatch(data);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }).start();
        });
    }
}

---

## Phaser — Dynamic Phased Computation

### Basic Usage


**What this code does — step by step:**

1. Phaser is like a CyclicBarrier but more flexible
2. `Phaser phaser = new Phaser(3);` — 3 parties registered
3. Each thread registers itself
4. `doWork(phase, p);` — Do work for this phase
5. `phaser.arriveAndAwaitAdvance();` — Wait for all threads

The same code, clean:

```java
Phaser phaser = new Phaser(3);

for (int i = 0; i < 3; i++) {
    final int phase = i;
    new Thread(() -> {
        for (int p = 0; p < 3; p++) {
            doWork(phase, p);
            phaser.arriveAndAwaitAdvance();
        }
    }).start();
}
```

### Dynamic Registration


**What this code does — step by step:**

1. `Phaser phaser = new Phaser(1);` — Start with 1 (main thread)
2. Dynamically add workers
3. `phaser.register();` — Add a party
4. `phaser.arriveAndDeregister();` — Done — remove myself
5. `phaser.arriveAndDeregister();` — Still remove on error
6. Main thread waits for all workers

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Phaser phaser = new Phaser(1);

        for (int i = 0; i < 5; i++) {
            phaser.register();
            final int workerId = i;
            new Thread(() -> {
                try {
                    doWork(workerId);
                    phaser.arriveAndDeregister();
                } catch (Exception e) {
                    phaser.arriveAndDeregister();
                }
            }).start();
        }

        phaser.arriveAndAwaitAdvance();
        System.out.println("All dynamic workers finished!");
    }
}
```

### Phase-Based Processing


**What this code does — step by step:**

1. Phase 0: Data Loading
2. `phaser.arriveAndAwaitAdvance();` — Wait for all
3. Phase 1: Processing
4. `phaser.arriveAndAwaitAdvance();` — Wait for all
5. Phase 2: Cleanup
6. `phaser.arriveAndDeregister();` — Done

The same code, clean:

```java
public class MultiPhaseProcessor {

    private final Phaser phaser;

    public MultiPhaseProcessor(int workerCount) {
        this.phaser = new Phaser(workerCount);
    }

    public void process() {
        for (int i = 0; i < 3; i++) {
            final int workerId = i;
            new Thread(() -> {
                loadData(workerId);
                phaser.arriveAndAwaitAdvance();

                processData(workerId);
                phaser.arriveAndAwaitAdvance();

                cleanup(workerId);
                phaser.arriveAndDeregister();
            }).start();
        }
    }
}
```

---

## In an Organization

### Scenario 1: Parallel Report Generation

@Service
public class ReportGenerator {

    public Report generateFullReport(String companyId) {
        CountDownLatch latch = new CountDownLatch(4);
        AtomicReference<FinancialData> financial = new AtomicReference<>();
        AtomicReference<List<Employee>> employees = new AtomicReference<>();
        AtomicReference<List<Project>> projects = new AtomicReference<>();
        AtomicReference<Map<String, Object>> metrics = new AtomicReference<>();

        // Generate 4 sections in parallel
        executor.submit(() -> {
            try { financial.set(generateFinancial(companyId)); }
            finally { latch.countDown(); }
        });

        executor.submit(() -> {
            try { employees.set(generateEmployeeList(companyId)); }
            finally { latch.countDown(); }
        });

        executor.submit(() -> {
            try { projects.set(generateProjectList(companyId)); }
            finally { latch.countDown(); }
        });

        executor.submit(() -> {
            try { metrics.set(generateMetrics(companyId)); }
            finally { latch.countDown(); }
        });

        latch.await(30, TimeUnit.SECONDS);

        return new Report(financial.get(), employees.get(), projects.get(), metrics.get());
    }
}

### Scenario 2: Batch Processing in Waves

public class WaveProcessor {

    private final CyclicBarrier barrier;
    private final List<DataChunk> chunks;

    public WaveProcessor(List<DataChunk> chunks, int waveSize) {
        this.chunks = chunks;
        this.barrier = new CyclicBarrier(waveSize, this::onWaveComplete);
    }

    public void processAllWaves() {
        int waveCount = (chunks.size() + barrier.getParties() - 1) / barrier.getParties();

        for (int wave = 0; wave < waveCount; wave++) {
            List<DataChunk> waveChunks = chunks.subList(
                wave * barrier.getParties(),
                Math.min((wave + 1) * barrier.getParties(), chunks.size())
            );

            waveChunks.forEach(chunk -> {
                new Thread(() -> {
                    try {
                        processChunk(chunk);
                        barrier.await();  // Wait for wave to complete
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }).start();
            });
        }
    }

    private void onWaveComplete() {
        System.out.println("Wave completed! Starting next wave...");
    }
}

---

## Choosing the Right Tool

| Scenario | Tool | Why |
|----------|------|-----|
| "Wait for N tasks to finish" | `CountDownLatch` | One-shot, simple |
| "Threads wait for each other at a point" | `CyclicBarrier` | Reusable, automatic reset |
| "Complex phased computation" | `Phaser` | Dynamic registration, phase numbers |
| "Start all at once" | `CountDownLatch` | Count down from N, then release |
| "Process in waves" | `CyclicBarrier` | Reset after each wave |
| "Add/remove workers dynamically" | `Phaser` | Register/deregister at any time |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not handling `InterruptedException` | Thread interrupted, latch/barrier hangs | Catch and re-set interrupt flag |
| Using CountDownLatch when CyclicBarrier is needed | Can't reuse — one-shot only | Use CyclicBarrier for repeated synchronization |
| Forgetting `finally` block for countDown/arrive | Barrier hangs forever if thread crashes | Always use try-finally |
| Using `await()` without timeout | Blocks forever if a thread dies | Use `await(timeout, unit)` |
| Not registering all parties in Phaser | Phaser completes prematurely | Register all parties before they start |
| Creating too many barriers | Complex, hard to maintain | Use a single barrier per synchronization point |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/core/concurrency.html)
