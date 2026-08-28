---
title: JFR Profiling — Flight Recorder for Production
summary: Java Flight Recorder captures low-overhead diagnostic data in production — CPU hotspots, lock contention, I/O latency, GC pauses — without stopping the app.
order: 2
minutes: 22
topics: [JFR, flight recorder, profiling, CPU hotspot, lock contention, I/O latency, jdk.jfr, continuous profiling]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html
  - https://docs.oracle.com/javase/8/docs/platform/jdk/jfr/
---

# JFR Profiling — Flight Recorder for Production

## What is Java Flight Recorder? (From Zero)

Java Flight Recorder (JFR) is a **built-in profiling tool** that comes with every JDK (since Java 11, it's open source and free). It records low-overhead diagnostic events while your application runs — CPU usage, memory allocation, lock contention, I/O operations, GC pauses — all without stopping the app.

Think of it as a **dashboard data recorder** for your JVM, like a car's black box flight recorder:

| Tool | Overhead | Use in production? | What it captures |
|---|---|---|---|
| **JFR** | <1% | ✅ Yes | Everything: CPU, memory, locks, I/O, GC, threads |
| **async-profiler** | <1% | ✅ Yes | CPU + wall-clock sampling |
| **jvisualvm** | 5-15% | ⚠️ Dev only | Heap dumps, CPU sampling |
| **jprofiler** | 10-20% | ❌ Dev only | Full profiling with UI |

**JFR's killer feature**: it's always-on and production-safe. You can leave it running in production with negligible overhead, then analyze the data when something goes wrong.

---

## The Code — Line by Line

### Starting JFR from Command Line

```bash
# Start JFR recording for 60 seconds:
jcmd <pid> JFR.start name=profile duration=60s filename=profile.jfr

# Start continuous recording (until you stop it):
jcmd <pid> JFR.start name=continuous settings=profile filename=continuous.jfr

# Check running recordings:
jcmd <pid> JFR.recording

# Stop a recording:
jcmd <pid> JFR.stop name=profile
```

**Line-by-line explained:**
- `jcmd <pid> JFR.start` — The `jcmd` tool sends commands to a running JVM. You need the PID (use `jps` to find it).
- `name=profile` — A label for this recording session. You can have multiple recordings running.
- `duration=60s` — Automatically stop after 60 seconds. Omit for continuous recording.
- `filename=profile.jfr` — Where to write the recording file. JFR files are binary — use JDK Mission Control to view them.
- `settings=profile` — Use the "profile" preset (more detailed than "default"). Other presets: `default`, `minimal`.

### Programmatic JFR Control

```java
import jdk.jfr.*;

@Configuration
public class JfrConfig {

    @Bean
    public Recording jfrRecording() {
        Recording recording = new Recording();

        // Enable specific event categories
        recording.enable("jdk.CPUInformation");      // CPU info
        recording.enable("jdk.GarbageCollection");     // GC events
        recording.enable("jdk.JavaMonitorWait");       // Lock contention
        recording.enable("jdk.FileRead");              // File I/O
        recording.enable("jdk.FileWrite");
        recording.enable("jdk.SocketRead");            // Network I/O
        recording.enable("jdk.SocketWrite");
        recording.enable("jdk.ExecutionSample");       // CPU profiling (method-level)

        // Configure settings
        recording.setSetting("jdk.CPULoader.interval", "10 ms");
        recording.setSetting("jdk.NativeMethodSampling.interval", "10 ms");

        recording.setDuration(Duration.ofMinutes(30));  // Record for 30 minutes
        recording.setDestination(Path.of("/var/log/app/recording.jfr"));

        recording.start();
        return recording;     // Bean lifecycle manages start/stop
    }
}
```

**Line-by-line explained:**
- `recording.enable("jdk.CPUInformation")` — Enables specific event types. Each event type captures different data.
- `jdk.ExecutionSample` — The CPU profiler: periodically samples what method each thread is executing. This is how you find hot methods.
- `jdk.JavaMonitorWait` — Tracks lock contention: which threads are waiting for which locks, and for how long.
- `recording.setDuration(Duration.ofMinutes(30))` — Auto-stop after 30 minutes. Important for production: you don't want recordings running forever.
- `recording.setDestination(...)` — Write to a specific file path. Make sure the path is writable and has space.

### Custom JFR Events (Your Business Metrics)

```java
// Define a custom event — JFR records it automatically
@Label("Order Processing")
@StackTrace(true)           // Capture the full stack trace
@Category("Business")       // Organize in JMC
public class OrderProcessingEvent extends jdk.jfr.Event {

    @Label("Order ID")
    String orderId;

    @Label("Item Count")
    int itemCount;

    @Label("Total Amount")
    @Timespan              // JFR renders this as a duration
    long processingNanos;

    @Label("Success")
    boolean success;
}

// Usage in your service:
@Service
public class OrderService {
    public Order processOrder(OrderRequest request) {
        OrderProcessingEvent event = new OrderProcessingEvent();   // Create event
        event.orderId = request.getId();                           // Set fields
        event.itemCount = request.getItems().size();
        event.begin();                                             // Start timing

        try {
            Order order = doProcess(request);                      // Actual work
            event.success = true;
            return order;
        } catch (Exception e) {
            event.success = false;
            throw e;
        } finally {
            event.end();                                           // Stop timing — record the event
        }
    }
}
```

**Line-by-line explained:**
- `@Label("Order Processing")` — Human-readable name in JDK Mission Control.
- `@StackTrace(true)` — Capture the full call stack. Useful for understanding HOW you got to this code path.
- `@Category("Business")` — Groups this event with other business events in the JMC UI.
- `event.begin()` / `event.end()` — Times the code between these calls. JFR records the duration.
- The try/finally ensures `event.end()` is always called, even on exceptions.

---

## Real-World Scenarios

### Scenario 1: Finding a CPU Hotspot

A production API is slow but you don't know why:

```bash
# Start profiling
jcmd <pid> JFR.start name=cpu settings=profile duration=120s filename=cpu.jfr

# After 120 seconds, open cpu.jfr in JDK Mission Control:
# Top Methods → shows which methods consume the most CPU
# Flame Graph → shows the call chains leading to hot methods
```

JMC might show that `String.format()` in a tight loop is consuming 40% of CPU. You replace it with `StringBuilder` and the API gets 3x faster.

### Scenario 2: Debugging Lock Contention

```bash
jcmd <pid> JFR.start name=locks settings=profile duration=60s filename=locks.jfr
```

In JMC, the "Locks" tab shows:
- Thread "http-nio-8080-exec-5" waited 2.3 seconds for a lock held by "http-nio-8080-exec-12"
- The lock is on `OrderRepository.save()` — the bottleneck is database serialization

### Scenario 3: Memory Allocation Hotspot

```bash
jcmd <pid> JFR.start name=alloc settings=profile duration=60s filename=alloc.jfr
```

JMC's "TLAB Allocation" view shows:
- `String.concat()` allocates 2GB of temporary strings per minute
- Fix: use `StringBuilder` or pre-allocate

---

## Analyzing JFR Files

### Using JDK Mission Control (JMC)

1. Open the `.jfr` file in JMC (free, comes with JDK)
2. **Dashboard** → Overview of events
3. **Method Profiling** → Top CPU-consuming methods
4. **Lock Profiling** → Which threads are waiting for locks
5. **I/O Profiling** → Slow file/network operations
6. **Event Browser** → Raw event data

### Using JFR Tool (Command Line)

```bash
# Print summary of a JFR file:
jfr summary profile.jfr

# Print specific events:
jfr print --eventsjdk.GarbageCollection profile.jfr

# Print to text format for scripting:
jfr print --json profile.jfr | jq '.events[] | select(.eventType == "jdk.GarbageCollection")'
```

---

## Common Mistakes

| Mistake | Why It's a Problem | Fix |
|---|---|---|
| Using VisualVM in production | 5-15% overhead can cause issues | Use JFR (<1% overhead) instead |
| Not enabling `jdk.ExecutionSample` | Can't see CPU hotspots at method level | Always include in profiling settings |
| Setting duration too long | Large files, disk space issues | Use 60-300 seconds for targeted profiling |
| Forgetting to enable lock events | Can't diagnose contention | Enable `jdk.JavaMonitorWait` |
| Not using custom events | Can't correlate JVM data with business metrics | Define custom Event classes for critical paths |
| Running multiple JFR recordings | Each adds overhead | Use one continuous recording, enable/disable events as needed |

---

## Key Takeaways

- **JFR is production-safe** (<1% overhead) — use it instead of VisualVM/profilers in production.
- **Always-on profiling** — leave JFR running continuously, analyze when incidents happen.
- **Custom events** bridge JVM metrics and business logic — track order processing, payment latency, etc.
- **JDK Mission Control** is the free analysis tool — learn its Method Profiling, Lock Profiling, and I/O views.
- **Flame graphs** are the fastest way to understand CPU hotspots — they show the full call chain.

Official docs: [jfr tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html) · [JFR API](https://docs.oracle.com/javase/8/docs/platform/jdk/jfr/)
