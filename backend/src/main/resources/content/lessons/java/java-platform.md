---
title: The Java Platform & Toolchain
summary: How the JVM, JDK and bytecode fit together, plus the build tooling every organization standardizes on.
order: 1
minutes: 18
topics: [jvm, jdk, bytecode, maven, toolchain]
docs:
  - https://docs.oracle.com/javase/tutorial/getStarted/intro/definition.html
  - https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html
---

# The Java Platform & Toolchain

## What Java actually is

Java is not "a language" — it is a **platform**. The language compiles to **bytecode**, and the **JVM** (Java Virtual Machine) executes that bytecode on any OS. This is why a Spring Boot jar built on a laptop runs unchanged on a Linux server.

```
.java source  --javac-->  .class bytecode  --JVM-->  machine code (JIT)
```

| Piece | Role |
|---|---|
| **JDK** | Development kit: compiler (`javac`), tools (`jmap`, `jcmd`, `jar`), the JVM |
| **JRE** (legacy) | Just the runtime — folded into the JDK since Java 9 |
| **JVM** | Executes bytecode, manages memory & GC, JIT-compiles hot paths |
| **Bytecode** | Portable, verifiable intermediate representation |

## The toolchain in practice

```bash
# Verify the toolchain
java -version     # java version "21.0.x"  (LTS)
javac -version    # javac 21.0.x
mvn -version      # Apache Maven 3.9.x

# Compile and run a class by hand (Maven/Gradle do this for you)
javac -d target/classes src/main/java/com/bank/Account.java
java -cp target/classes com.bank.Account

# Inspect the bytecode the JVM actually runs
javap -c target/classes/com/bank/Account.class
```

## How a class is loaded and run

When the JVM needs a class it goes through:

1. **Loading** — the classloader reads the `.class` file (delegation: App → Platform → Bootstrap).
2. **Linking** — verify bytecode, prepare static fields, resolve references.
3. **Initialization** — run static initializers (once, thread-safely).

```java
public class ClassLoadingDemo {
    static { System.out.println("static init runs once, before main"); }

    public static void main(String[] args) throws Exception {
        Class<?> c = Class.forName("com.bank.core.Money");
        System.out.println(c.getClassLoader());
        // NoClassDefFoundError   -> present at compile, missing at runtime
        // ClassNotFoundException -> reflective lookup failed
    }
}
```

## Build tools: Maven (standard) and Gradle

Every Spring project is built with **Maven** (`pom.xml`) or **Gradle** (`build.gradle`). Organizations standardize on one. Maven's model:

- **Standard directory layout** — `src/main/java`, `src/main/resources`, `src/test/java`.
- **Dependencies** from Maven Central, managed by coordinates `groupId:artifactId:version`.
- **Lifecycle**: `validate → compile → test → package → verify → install → deploy`.

```bash
mvn clean verify        # full build with tests
mvn spring-boot:run     # run a Spring Boot app
mvn -DskipTests package # jar without running tests
```

The `pom.xml` declares a parent (Spring Boot) that pins versions for you:

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.4.7</version>
</parent>
```

## JVM flags organizations actually use in production

```bash
java -XX:+UseG1GC -XX:MaxRAMPercentage=75.0 \
     -XX:+HeapDumpOnOutOfMemoryError -Xlog:gc* \
     -jar payments-api.jar
```

## Memory & garbage collection (the 30-second version)

The heap is split into **young gen** (Eden + survivors) and **old gen**; **Metaspace** holds class metadata off-heap. GC algorithms:

| Collector | When to use |
|---|---|
| G1 | **Default** — region-based, predictable pauses, most workloads |
| ZGC | Sub-millisecond pauses, very large heaps (Java 21 production-ready) |
| Parallel | Throughput-first batch jobs |

```bash
java -Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=10m -jar app.jar
jmap -histo:live <pid> | head -20        # allocation suspects
jcmd <pid> GC.heap_dump /tmp/heap.hprof  # dump for MAT / VisualVM
```

> **Why it matters (organizational view)** — The platform is a shared contract. Teams standardize on one LTS JDK (21 today) and one build tool, so every service builds, tests and runs the same way. New hires go from "runs on my machine" to "runs everywhere" the moment they understand that `.java → bytecode → JVM` pipeline.

## Key takeaways

- Java = language + bytecode + JVM; portability comes from the JVM, not the compiler.
- Maven's lifecycle and layout are the default contract for every Spring project.
- GC tuning is diagnostics-first: measure with `-Xlog:gc*`, then choose a collector.
- Always run LTS JDKs in production and pin the toolchain in CI.

**Official docs:** [Java SE 21 docs](https://docs.oracle.com/en/java/javase/21/) · [The Java Tutorials](https://docs.oracle.com/javase/tutorial/getStarted/intro/definition.html) · [Maven Getting Started](https://maven.apache.org/guides/getting-started/)
