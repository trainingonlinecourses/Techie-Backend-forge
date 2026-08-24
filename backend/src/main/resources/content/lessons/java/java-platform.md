---
title: The Java Platform — JVM, JRE, JDK, Bytecode, and Garbage Collection
summary: What the JVM actually does, how source code becomes bytecode, how the JIT compiler makes Java fast, how garbage collection works, class loading, and why understanding the platform matters for production debugging with line-by-line walkthroughs.
order: 1
minutes: 25
topics: [jvm, jre, jdk, bytecode, jit, garbage-collection, class-loading, java-platform]
docs:
  - https://docs.oracle.com/javase/8/docs/
  - https://docs.oracle.com/javase/8/docs/technotes/guides/vm/index.html
---

# The Java Platform — JVM, JRE, JDK, Bytecode, and Garbage Collection

## What happens when you run a Java program?

When you write `System.out.println("Hello")` and run it, three things happen:

1. **Compile**: `javac` converts your `.java` file to `.class` file (bytecode).
2. **Load**: The JVM reads the `.class` file and loads it into memory.
3. **Execute**: The JVM interprets or JIT-compiles the bytecode to machine code.

**Beginner mental model:** Think of Java like a universal translator. You write in English (Java source code), it translates to a neutral language (bytecode), and then any computer with a JVM can execute it. That's why Java is "write once, run anywhere."

```java
// You write this (HelloWorld.java):
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}

// javac compiles it to HelloWorld.class (bytecode — not human-readable)
// The JVM reads HelloWorld.class and executes it
```

## JDK vs JRE vs JVM

| Component | What it is | What it includes |
|---|---|---|
| **JVM** (Java Virtual Machine) | Runs Java bytecode | Interpreter + JIT compiler + Garbage Collector |
| **JRE** (Java Runtime Environment) | JVM + standard libraries | JVM + core classes (java.lang, java.util, etc.) |
| **JDK** (Java Development Kit) | JRE + development tools | JRE + javac + debugger + jpackage + jshell |

```
JDK
├── JRE
│   ├── JVM (java command)
│   │   ├── Interpreter (reads bytecode line by line)
│   │   ├── JIT Compiler (compiles hot bytecode to machine code)
│   │   └── Garbage Collector (frees unused memory)
│   └── Core Libraries (java.lang, java.util, java.io, etc.)
└── Dev Tools (javac, javadoc, jpackage, jshell)
```

## Bytecode — what the JVM actually runs

```java
// Your source code:
int add(int a, int b) {
    return a + b;
}

// javac compiles it to bytecode (simplified):
// iconst_1      // push constant 1 onto the stack
// iload_0       // push local variable 0 (parameter a) onto the stack
// iload_1       // push local variable 1 (parameter b) onto the stack
// iadd          // pop two values, add them, push result
// ireturn       // return the integer result

// The bytecode runs on a STACK MACHINE:
// 1. iconst_1: stack = [1]
// 2. iload_0:  stack = [1, a]
// 3. iload_1:  stack = [1, a, b]
// 4. iadd:     stack = [1, a+b]  (pops b and a, pushes a+b)
// 5. ireturn:  returns a+b
```

You can inspect bytecode with `javap`:
```bash
javap -c HelloWorld.class     # shows the bytecode instructions
javap -verbose HelloWorld.class  # shows constants, pools, attributes
```

## JIT Compiler — making Java fast

The JVM has two execution modes:

1. **Interpreter**: Reads bytecode line by line (slow, but starts immediately).
2. **JIT (Just-In-Time) Compiler**: Compiles frequently-executed bytecode ("hot spots") to native machine code (fast, but takes time to compile).

```java
// Java starts by INTERPRETING bytecode — quick startup
// After running a method 10,000+ times, the JIT compiler kicks in:
// It compiles that method to native machine code — 10-100x faster
// The compiled code is cached — next call runs the fast native version

// This is why Java can be slow on the first request but fast after warmup:
// Request 1: interpreted (50ms)
// Request 2: interpreted (50ms)
// ...
// Request 10,000: JIT compiles the method (takes extra time this once)
// Request 10,001: native code (5ms!)
```

You can control JIT with flags:
```bash
java -XX:+PrintCompilation MyApp    # see when methods are JIT-compiled
java -XX:-TieredCompilation MyApp   # disable tiered compilation (for benchmarking)
```

## Garbage Collection — automatic memory management

In C/C++, you manually allocate and free memory. Forget to free → memory leak. Free too early → crash. Java's Garbage Collector (GC) handles this automatically.

```java
// Java automatically manages memory:
public void processOrders() {
    Order order = new Order();        // GC allocates memory for the Order object
    List<Item> items = loadItems();   // GC allocates memory for the list and items
    // ... process order ...

    // When processOrders() returns, 'order' and 'items' go out of scope
    // The GC eventually reclaims this memory — you don't need to call free() or delete()

    // Forcing GC (don't do this in production — it's just for learning):
    System.gc();   // suggests to the JVM to run GC (JVM may ignore this)
}
```

### How the GC works (simplified)

```
Heap Memory
├── Young Generation (short-lived objects)
│   ├── Eden Space (new objects go here first)
│   ├── Survivor Space 1 (survived one GC cycle)
│   └── Survivor Space 2 (survived two GC cycles)
└── Old Generation (long-lived objects — promoted from Young)
```

```java
// When you create an object, it goes to Eden Space
User user = new User("Alice");  // allocated in Eden

// After many GC cycles, if 'user' is still referenced, it's promoted to Old Gen
// This is called "generational collection" — most objects die young
```

### GC algorithms

| Algorithm | Best for | How it works |
|---|---|---|
| **Serial GC** | Small apps, single CPU | One thread does all GC — pauses everything |
| **Parallel GC** | Throughput-focused apps | Multiple threads do GC — faster but still pauses |
| **G1 GC** (default since Java 9) | Balanced apps | Divides heap into regions, collects most-filled first |
| **ZGC** (Java 15+) | Ultra-low-latency | Concurrent GC — pauses < 1ms |

```bash
# Use G1 GC (default):
java -XX:+UseG1GC MyApp

# Use ZGC for low latency:
java -XX:+UseZGC MyApp
```

## Class Loading — how classes enter the JVM

```java
// When you use a class for the first time, the JVM:
// 1. Finds the .class file (classpath scanning)
// 2. Reads the bytecode
// 3. Verifies it's valid (security check)
// 4. Allocates memory for static fields
// 5. Executes static initializer blocks

public class Config {
    static {
        System.out.println("Config class loaded!");  // runs once, when Config is first used
    }

    public static final String APP_NAME = "MyApp";  // initialized during class loading
}

// The class loader hierarchy:
// Bootstrap ClassLoader (loads java.lang, java.util — core JDK classes)
//   └── Application ClassLoader (loads your classes from classpath)
//       └── Custom ClassLoaders (load classes from DB, network, hot-reload)
```

## How we use this knowledge in organizations

### Scenario 1: Diagnosing production memory issues

```java
// When an OutOfMemoryError occurs, use JVM flags to diagnose:
// java -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/heapdump.hprof MyApp

// Then analyze with VisualVM or Eclipse MAT:
// 1. Open the heap dump
// 2. Look for the largest objects
// 3. Find what's holding references to them
// 4. Fix the leak (usually a static Map that grows forever)

// Common leak: static cache without eviction
public class LeakyCache {
    private static final Map<String, byte[]> cache = new HashMap<>();  // never freed!
    // Fix: use WeakHashMap, Caffeine, or add TTL eviction
}
```

### Scenario 2: JVM tuning for production

```bash
# Production startup with tuned memory:
java \
  -Xms4g \                    # Initial heap size: 4GB
  -Xmx4g \                    # Maximum heap size: 4GB (set equal to avoid resizing)
  -XX:+UseG1GC \              # Use G1 garbage collector
  -XX:MaxGCPauseMillis=200 \   # Target max GC pause: 200ms
  -XX:+HeapDumpOnOutOfMemoryError \  # Dump heap on OOM
  -jar app.jar
```

### Scenario 3: Understanding class loading for hot-reload

```java
// Spring Boot DevTools uses a separate classloader for hot-reload:
// 1. Base classloader loads your dependencies (don't change)
// 2. Restart classloader loads your application code (changes on reload)
// 3. When you edit a file, only the restart classloader is recreated
// This is why Spring Boot restarts so fast — it doesn't reload 200+ dependencies

// Custom classloader for plugin systems:
public class PluginClassLoader extends URLClassLoader {
    public PluginClassLoader(URL[] urls, ClassLoader parent) {
        super(urls, parent);
    }

    // Override to implement custom class loading logic
    // (e.g., loading classes from a database or encrypted files)
}
```

## Key JVM flags for production

| Flag | Purpose |
|---|---|
| `-Xms` / `-Xmx` | Initial / max heap size |
| `-XX:+UseG1GC` | Use G1 garbage collector (default) |
| `-XX:MaxGCPauseMillis` | Target max GC pause time |
| `-XX:+HeapDumpOnOutOfMemoryError` | Auto-dump heap on OOM |
| `-XX:+PrintGCDetails` | Log GC activity (deprecated in Java 9+) |
| `-XX:MetaspaceSize` | Size of metaspace (class metadata) |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Setting -Xmx too low | OutOfMemoryError | Monitor heap usage, increase to fit workload |
| Setting -Xms much lower than -Xmx | GC pauses during heap resizing | Set -Xms = -Xmx |
| Forgetting -XX:+HeapDumpOnOutOfMemoryError | No diagnostic data on OOM | Always add this flag in production |
| Ignoring GC logs | Can't diagnose latency spikes | Enable GC logging and monitor |
| Using default Serial GC in production | Long GC pauses on large heaps | Use G1 or ZGC |
