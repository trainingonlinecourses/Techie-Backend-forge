---
title: Class Loading & the JVM — Complete Beginner's Guide
summary: How the JVM loads classes, the three class loaders, delegation model, and why classloader leaks crash redeployments.
order: 18
minutes: 18
topics: [classloading, classloader, delegation, parent-first, classpath, metaspace]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
  - https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html
---

# Class Loading & the JVM — Complete Beginner's Guide

## What is class loading?

When you run a Java program, the JVM doesn't load all your code at once. It loads classes **on demand** — when they're first referenced. Class loading is the process of finding the `.class` file, reading its bytecode, and putting it into memory.

```java
// This triggers class loading:
Order order = new Order();  // Line 1: JVM loads Order.class when this line executes
                            // Line 2: Before this, Order.class wasn't loaded
```

**The three steps of class loading:**
1. **Loading** — Find the `.class` file and read the bytecode
2. **Linking** — Verify the bytecode, allocate memory for static fields, resolve references
3. **Initialization** — Run static initializers (`static { }` blocks, static field assignments)

## The three class loaders

The JVM has a hierarchy of class loaders, each with a specific job:

```
Bootstrap ClassLoader (C code, loads core Java classes)
    ↑
Platform ClassLoader (loads Java module classes)
    ↑
Application ClassLoader (loads YOUR classes from classpath)
```

```java
// You can see the class loader hierarchy:
public class ClassLoaderDemo {
    public static void main(String[] args) {
        // Line 1: Application ClassLoader — loads your classes
        ClassLoader appLoader = ClassLoaderDemo.class.getClassLoader();
        System.out.println("App loader: " + appLoader);
        // Output: sun.misc.Launcher$AppClassLoader@...
        
        // Line 2: Platform ClassLoader — loads java.sql, java.xml, etc.
        ClassLoader platformLoader = appLoader.getParent();
        System.out.println("Platform loader: " + platformLoader);
        // Output: sun.misc.Launcher$ExtClassLoader@... (or PlatformClassLoader)
        
        // Line 3: Bootstrap ClassLoader — loads java.lang, java.util (C code, returns null)
        ClassLoader bootstrapLoader = platformLoader.getParent();
        System.out.println("Bootstrap loader: " + bootstrapLoader);
        // Output: null (it's implemented in C, not Java)
    }
}
```

## The delegation model — parent-first loading

When a class loader needs to load a class, it **delegates to its parent first**:

```
1. Application ClassLoader receives: "load Order.class"
2. Delegates to Platform ClassLoader
3. Platform ClassLoader delegates to Bootstrap ClassLoader
4. Bootstrap ClassLoader: "I don't have Order.class"
5. Platform ClassLoader: "I don't have it either"
6. Application ClassLoader: "I'll load it from classpath"
```

**Why parent-first?** Prevents loading the same class twice with different implementations. If you wrote your own `java.lang.String`, the parent-first model ensures the bootstrap loader's `String` is used instead — critical for security and consistency.

```java
// The delegation model prevents this:
// Your classloader loads: java.lang.String (malicious)
// Bootstrap classloader loads: java.lang.String (real)
// Without delegation: two String classes exist → chaos

// With delegation: parent loaders always win → consistent behavior
```

## How Spring Boot uses class loading

Spring Boot's executable JAR uses a custom class loader to read nested JARs:

```
my-app.jar
├── BOOT-INF/
│   ├── classes/                    ← Your compiled .class files
│   └── lib/                        ← Dependencies (nested JARs)
│       ├── spring-boot-3.2.jar
│       └── ...
├── META-INF/
│   └── MANIFEST.MF                ← Points to the custom launcher
└── org/springframework/boot/loader/  ← The custom class loader
```

**Why can't you just `java -cp my-app.jar Main`?** Because JARs inside JARs aren't on the classpath. Spring Boot's `LaunchedURLClassLoader` reads nested JARs directly from the outer JAR's entries.

## Class loader leaks — the redeployment killer

When you undeploy a web app (e.g., hot-reload in Tomcat), the old class loader should be garbage collected. But if any reference to old classes survives, the class loader and ALL its classes stay in memory — that's a **classloader leak**.

```java
// A classloader leak in action:
// 1. Deploy app → ClassLoader A loads 500 classes
// 2. Redeploy app → ClassLoader B loads 500 new classes
// 3. ClassLoader A should be GC'd → but it's not!
// 4. Result: 1000 classes in Metaspace → OutOfMemoryError

// Common causes:
// - Static fields holding references to old classes
// - ThreadLocal variables never removed
// - JDBC drivers never deregistered
// - Listeners/observers never unregistered

// Prevention:
public class CleanupListener implements ServletContextListener {
    @Override
    public void contextDestroyed(ServletContextEvent sce) {
        // Line 1: Deregister JDBC drivers
        Enumeration<Driver> drivers = DriverManager.getDrivers();
        while (drivers.hasMoreElements()) {
            Driver driver = drivers.nextElement();
            DriverManager.deregisterDriver(driver);  // Line 2: Release the reference
        }
        
        // Line 3: Stop thread pools
        // Line 4: Close connections
        // Line 5: Clear ThreadLocals
    }
}
```

## Real-world scenario — debugging a classloader leak

```bash
# Symptom: Metaspace grows on each redeploy
jcmd <pid> GC.heap_info  # Metaspace keeps growing

# Step 1: Take a heap dump after 3 redeployments
jmap -dump:live,format=b,file=heap.hprof <pid>

# Step 2: Open in Eclipse MAT → Leak Suspects
# Finding: 3 copies of com.acme.OrderService loaded by different classloaders

# Step 3: Path to GC Roots
# Root cause: A static field in ApplicationStartup holds a reference to the old class

# Step 4: Fix — remove the static reference or use a WeakReference
public class ApplicationStartup {
    private static WeakReference<ClassLoader> oldLoader;  // WeakReference allows GC
}
```

## Key takeaways

- Class loading: load bytecode → link (verify/prepare/resolve) → initialize (static blocks)
- Three loaders: Bootstrap (core), Platform (modules), Application (your code)
- Parent-first delegation prevents duplicate classes and security issues
- Spring Boot's `LaunchedURLClassLoader` reads nested JARs in executable JARs
- Classloader leaks happen when references survive redeployment — deregister drivers, clear ThreadLocals

**Official docs:** [java tool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html) · [JVM Spec — class loading](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html)
