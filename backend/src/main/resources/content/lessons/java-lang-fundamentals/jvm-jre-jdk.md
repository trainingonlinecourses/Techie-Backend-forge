---
title: Java Language Fundamentals — JVM, JRE, JDK Architecture
summary: The difference between JVM, JRE and JDK, the classloader subsystem, bytecode verification, the method area, heap, stack, and PC register — why a Java program runs anywhere and what "write once, run anywhere" actually means under the hood.
order: 1
minutes: 20
topics: [jvm, jre, jdk, classloader, bytecode, verification, method-area, heap, stack, pc-register]
docs:
  - https://docs.oracle.com/javase/specs/jvms/se21/html/
---

## The Concept, From Zero

When you run `java MyClass`, three things work together: the **JDK** (what you installed), the **JRE** (what runs the program), and the **JVM** (the actual virtual machine that executes bytecode). Beginners often hear these acronyms used interchangeably, but they are three distinct layers, and understanding the difference explains why Java behaves the way it does — why it starts slowly, why it needs a runtime, why it checks bytecode before running it.

### The JDK — The Development Kit

The **JDK** (Java Development Kit) is the complete package for writing and running Java. It contains:
- The **compiler** (`javac`) that turns `.java` source files into `.class` bytecode files.
- The **JRE** (the runtime) so you can run programs without installing a separate runtime.
- Development tools: `javadoc`, `jar`, `jshell`, `javap` (the bytecode disassembler), `jdb` (debugger), and the `jcmd`/`jps`/`jstat` diagnostic tools.

If you only wanted to **run** a Java program, you would install just the JRE (historically). On modern JDKs (since Java 9), the JRE is no longer shipped as a separate download — the "runtime" is a subset of the JDK image produced by `jlink`. But conceptually the distinction still matters: the JDK is for developers, the runtime is for machines that only run programs.

A common beginner confusion: *"Why do I need to install the JDK to run a program?"* You usually don't — end users can install just a runtime. But on a developer machine, the JDK gives you the compiler and tools. And because modern JDK distributions (Adoptium/Temurin, Amazon Corretto, Azul Zulu) package the runtime inside the JDK image, installing the JDK is the pragmatic one-step choice.

### The JRE — The Runtime Environment

The **JRE** (Java Runtime Environment) is everything needed to **run** a Java program, but not to compile one:
- The **JVM** (the virtual machine).
- The **core class libraries** (`java.lang`, `java.util`, `java.io`, and all the others in the JDK image).
- The launch infrastructure (`java` launcher, the `java` command, the shared libraries).

The JRE is what you would ship to a production server or a user's machine if you did not want to include the compiler and diagnostic tools. Since Java 9, the JRE is not a separate install, but the concept survives: a runtime image produced by `jlink` contains exactly the modules a program needs, nothing more.

### The JVM — The Virtual Machine

The **JVM** (Java Virtual Machine) is the engine. It is a specification (defined in the Java Virtual Machine Specification) with many implementations (HotSpot, Eclipse OpenJ9, GraalVM, Azul Zulu's VM). The JVM:
- Loads `.class` files (bytecode).
- Verifies the bytecode is safe (the **bytecode verifier**).
- Executes the bytecode — either by interpreting it, or by compiling hot methods to native code (the **JIT**, Just-In-Time compiler).
- Manages memory: heap, stack, garbage collection.
- Provides the runtime services: threading, reflection, security manager (deprecated), and the.invoke dynamic support used by lambdas and method handles.

The JVM is the reason for "write once, run anywhere" (WORA). You compile Java source to **bytecode** (`.class` files), and that bytecode is the same on every platform. Each platform (Windows, Linux, macOS, ARM, etc.) has its own JVM implementation that knows how to execute that bytecode on that platform. You do not recompile for each target — the same `.class` file runs on any JVM.

```java
// Compile once, run anywhere
// javac Hello.java   produces Hello.class
// java Hello         runs on any OS with a JVM

public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

The bytecode in `Hello.class` is platform-neutral. A Windows JVM reads the same bytecode and produces Windows machine code; a Linux JVM on ARM reads the same bytecode and produces ARM machine code. The JVM is the translator.

### The JVM Architecture — What's Inside

Understanding the JVM's internal memory model explains `StackOverflowError`, `OutOfMemoryError`, why local variables disappear when a method returns, and why objects live on the heap. The JVM spec defines several runtime data areas:

#### The Heap — where objects live

The **heap** is the runtime data area from which memory for all class instances and arrays is allocated. The heap is shared across all threads. When you write `new Customer()`, the object's memory comes from the heap. The heap is managed by the garbage collector — when an object is no longer reachable, the GC reclaims its space.

```java
// Heap: every 'new' allocates here
Customer c = new Customer("Alice");   // the Customer object is on the heap
```

The reference `c` itself (the 4- or 8-byte pointer) is on the stack, but the object it points to is on the heap. This split — reference on the stack, object on the heap — is why two variables can point to the same object, why passing an object to a method lets the method mutate it, and why `null` is a valid value for any reference.

#### The Young Generation and Old Generation

The heap is usually split into generations:
- **Young Generation** — where new objects are allocated. Most objects die young (within a few milliseconds or seconds). The young generation is collected frequently and quickly (a "minor GC").
- **Old Generation** (or Tenured) — objects that survive several young GCs get promoted here. Old generation GCs are less frequent but slower (a "major GC" or "full GC").

This generational design is based on the **weak generational hypothesis**: most objects die young. By separating short-lived from long-lived objects, the JVM spends most of its time collecting the cheap young generation and rarely touches the expensive old generation. That is why stopping the world for GC is usually brief even for large heaps.

#### The Stack — where method calls and local variables live

Each thread has its own **Java Virtual Machine Stack**. The stack stores **frames** — one frame per method invocation. A frame holds:
- Local variables (the primitive local variables and reference variables declared in the method).
- The operand stack (used for bytecode operations like `dup`, `invokevirtual`).
- A reference to the constant pool of the current class.

When you call a method, a new frame is pushed onto the thread's stack. When the method returns, the frame is popped. When the stack runs out of space (e.g., infinite recursion), you get a `StackOverflowError`.

```java
// Each call adds a frame to the stack
static void recurse(int n) {
    if (n == 0) return;
    recurse(n - 1);   // each call pushes a new frame
}
// recurse(1_000_000)  — eventually StackOverflowError
```

Local variables live only as long as their frame is on the stack. When `recurse` returns, its local variable `n` is gone. This is why local variables are not shared between threads — each thread has its own stack.

#### The Program Counter (PC) Register

Each thread has a **PC register** that holds the address of the currently executing instruction (the "native" method address, or the bytecode index for a Java method). The PC register is what lets the JVM resume a thread exactly where it left off after a context switch. It is per-thread, very small, and you almost never interact with it directly.

#### The Method Area — where class metadata lives

The **method area** is shared across all threads. It stores:
- Class structures (runtime representation of loaded classes).
- The **constant pool** (literals, field references, method references compiled into the bytecode).
- Field and method data.
- The **code for methods** (bytecode), including JIT-compiled code in some implementations.
- Static variables.

Before Java 8, the method area was called the **Permanent Generation (PermGen)** and was part of the heap; running out of PermGen caused `OutOfMemoryError: PermGen space`. Since Java 8, the method area lives in a native-memory region called **Metaspace**, which is not part of the heap and grows up to a limit (or until the native memory is exhausted). Running out of Metaspace causes `OutOfMemoryError: Metaspace`. The classic cause: loading too many dynamic classes (Proxy classes, reflection-generated classes, classloader leaks in application servers).

```java
// Every loaded class has metadata in the method area / Metaspace
// Class.forName("com.example.MyClass") loads the class (if not already loaded)
```

#### The Constant Pool — the bytecode's symbol table

Every `.class` file has a **constant pool** — a table of constants and symbolic references: string literals, class and interface names, field names and descriptors, method names and descriptors, numeric literals. When the bytecode says `invokevirtual #42`, the `#42` refers to an entry in the constant pool that tells the JVM which method to call. The constant pool is part of the class file, loaded into the method area at runtime. This indirection is how the JVM supports dynamic linking — the actual memory address of a method is not baked into the bytecode; it is resolved at runtime via the constant pool.

```java
// In bytecode, this:
System.out.println("hello");
// compiles to something like:
//  getstatic  #2            // Field java/lang/System.out:LPrintStream;
//  ldc #3                   // String hello
//  invokevirtual #4         // Method java/io/PrintStream.println:(Ljava/lang/String;)V
```

The constant pool entries `#2`, `#3`, `#4` are resolved by the JVM at runtime. This is why reflection and dynamic proxies work — the JVM already has the machinery to look up methods by name and descriptor.

### The ClassLoader Subsystem — how classes get into the JVM

The JVM does not load all classes upfront. It loads them on demand, through a hierarchy of **classloaders**:
- **Bootstrap ClassLoader** — loads the core JDK classes (`java.lang.*`, `java.util.*`, etc.) from the JRE's `rt.jar` or the JDK image modules. Written in native code. It is the parent of all other classloaders.
- **Platform ClassLoader** (formerly "Extension ClassLoader") — loads classes from the JDK platform modules (the `java.sql`, `java.naming`, etc. modules in the JDK image).
- **System ClassLoader** (formerly "Application ClassLoader") — loads classes from the application classpath (`-classpath` or `-cp`, the `CLASSPATH` environment variable, and the jars in the module path). This is the classloader that loads your application's classes.

The classloaders form a **delegation hierarchy**: when a classloader is asked to load a class, it first delegates to its parent. The parent delegates to its parent, up to the bootstrap classloader. Only if the parent cannot find the class does the child try to load it itself. This is the **parent-delegation model**, and it is why you cannot easily replace `java.lang.String` with your own class — the bootstrap classloader already loaded the real `java.lang.String`, and the delegation ensures the core classes are always the JDK's.

```java
// ClassLoader delegation in action
ClassLoader cl = MyClass.class.getClassLoader();
// cl is the system (application) classloader
// Its parent is the platform classloader
// Its parent's parent is the bootstrap classloader (often null in Java code)
System.out.println(cl);                    // sun.misc.Launcher$AppClassLoader@...
System.out.println(cl.getParent());        // platform classloader
System.out.println(cl.getParent().getParent()); // null (bootstrap is native)
```

#### Custom ClassLoaders

You can write your own classloader by extending `ClassLoader` and overriding `findClass` (or `loadClass` if you want to change the delegation model). Custom classloaders are the foundation of:
- **Application servers** (Tomcat, WildFly) — each web app gets its own classloader, so two apps can use different versions of the same library without conflict.
- **Plugin systems** — loading plugins from separate jars at runtime.
- **Hot-reload** in development tools — loading a new version of a class without restarting the JVM.
- **OSGi, Jigsaw, and dynamic module systems**.

```java
// A minimal custom classloader that loads a class from a byte array
class ByteArrayClassLoader extends ClassLoader {
    private final Map<String, byte[]> classes = new HashMap<>();

    void store(String name, byte[] bytes) {
        classes.put(name, bytes);
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        byte[] bytes = classes.get(name.replace('.', '/') + ".class");
        if (bytes == null) throw new ClassNotFoundException(name);
        return defineClass(name, bytes, 0, bytes.length);
    }
}

// Usage
var loader = new ByteArrayClassLoader();
loader.store("com.example.Foo", compileSomehow());
Class<?> foo = loader.loadClass("com.example.Foo");
```

But be careful: a class is identified by its **fully qualified name AND the classloader that loaded it**. `com.example.Foo` loaded by classloader A is a different type than `com.example.Foo` loaded by classloader B. You cannot cast between them — you get ` ClassCastException` even though the names match. This is the root of many "classloader hell" bugs in application servers.

### The Bytecode Verifier — safety before execution

Before the JVM executes bytecode, it runs the **bytecode verifier** to check that the code is safe:
- No illegal data conversions (e.g., using an integer as an object reference).
- No stack overflows or underflows (the operand stack is always at the right depth).
- No illegal access to private fields or methods from outside the class.
- The bytecode does not try to bypass access control or violate type safety.

This verification is why you cannot take arbitrary byte arrays and execute them as Java code — the verifier rejects malformed or malicious bytecode. It is also why Java is memory-safe in the sense that a Java program cannot accidentally (or easily deliberately) read or write arbitrary memory addresses. The verifier, combined with the JVM's type system and bounds-checked arrays, is the security boundary.

```bash
# Inspect the bytecode verifier's work with javap
javap -c -p Hello.class
```

The output shows the actual bytecode instructions (`getstatic`, `ldc`, `invokevirtual`, `return`). You can see the constant pool references and the operand stack operations. This is the level at which the JVM operates — not Java source, but a stack-based instruction set that the verifier and the interpreter/JIT execute.

### The JIT Compiler — bytecode to native code at runtime

The JVM starts by interpreting bytecode (slowly). As it runs, the **JIT compiler** (Just-In-Time) identifies hot methods — methods that are called frequently — and compiles them to native machine code, which runs much faster than interpreted bytecode. The JIT:
- Profiles the running program (which methods are hot, which branches are taken).
- Compiles hot methods to optimized native code.
- Can recompile with more aggressive optimizations as it learns more (e.g., **escape analysis** to allocate objects on the stack instead of the heap, **inlining** of small methods, **dead code elimination**).
- Can deoptimize (stop using a compiled version) if the assumptions change (e.g., a new class is loaded that invalidates an inlining decision).

This is why Java startup can be slow (the JVM is warming up, interpreting, and profiling) but long-running services are fast — the JIT has optimized the hot paths. It is also why microbenchmarks that run too briefly give misleading results: the JIT has not had time to optimize. (This is the motivation behind **JMH** — the Java Microbenchmark Harness — which ensures the JVM reaches a steady state before measuring.)

```java
// The JIT eventually inlines and optimizes hot loops
static long sum(long n) {
    long total = 0;
    for (long i = 1; i <= n; i++) {
        total += i;
    }
    return total;
}
// After the JIT compiles sum(), the loop may be unrolled, vectorized,
// or replaced with a closed-form formula (n*(n+1)/2) if the JIT recognizes it.
```

The end user does not control the JIT directly, but understanding it helps explain performance behavior: don't micro-optimize Java code based on a single short run; write clean code and let the JIT do its job; use JMH for real benchmarks.

### "Write Once, Run Anywhere" — What It Actually Means

**WORA** means: the same compiled `.class`/`.jar` file runs on any platform that has a compatible JVM, without recompilation. It does **not** mean:
- The program behaves identically on every platform — file path separators differ (`\` vs `/`), line endings differ, locale and charset differ, available fonts and UI behavior differ on GUI apps.
- The program runs without a JVM installed — the target machine must have a JVM (or a runtime image) for the target platform.
- The program is automatically cross-platform if it uses native code (JNI) or platform-specific APIs — those parts break WORA.

For a backend API, WORA is huge: build the jar once in CI, deploy the same artifact to dev, staging, and production, regardless of the underlying OS. That is why Java is so popular in server-side environments.

```java
// Write once, run anywhere — as long as you stay within the JDK
// BAD: platform-specific path
File f = new File("data\\customers.txt");   // works on Windows, not Linux

// GOOD: platform-neutral
File f = new File("data" + File.separator + "customers.txt");
// or better, with NIO.2
Path p = Path.of("data", "customers.txt");   // works everywhere
```

### The JVM vs. Other Runtimes — Perspective

- **JVM vs. a native compiler (C/C++/Rust):** The JVM compiles to an intermediate bytecode and runs on a virtual machine; a native compiler compiles directly to machine code for a specific platform. Native code starts faster and has less overhead, but Java's bytecode + JIT + GC gives you portability, memory safety, and runtime optimization that is hard to match in native code. GraalVM native image (covered in the GraalVM module) bridges this gap by ahead-of-time compiling Java to a native binary.
- **JVM vs. Node.js/JavaScript:** Both are runtime environments, but the JVM has a stronger typing system, a richer concurrency model (virtual threads, locks, atomics), and a mature JIT. Node.js uses an event loop and is single-threaded by default; the JVM has true multithreading.
- **JVM vs. Python:** Both are interpreted/managed, but the JVM's JIT typically gives much higher peak performance. Python's GIL limits multithreading for CPU-bound work; the JVM has no such restriction.

### Where This Shows Up in an Organization

- **Sizing a production JVM.** Understanding heap, generations, and GC lets you size `-Xms`/`-Xmx`, choose a garbage collector (G1, ZGC, Shenandoah), and diagnose `OutOfMemoryError` and long GC pauses. The JVM module covers GC in depth; this lesson is the foundation.
- **Diagnosing classloader leaks.** An application server that keeps loading new versions of classes without unloading old ones will eventually run out of Metaspace. Understanding classloaders and the method area is the prerequisite for debugging that.
- **Debugging `StackOverflowError` and `OutOfMemoryError`.** Knowing that the stack holds method frames tells you why deep recursion crashes with `StackOverflowError`, and knowing the heap vs. Metaspace distinction tells you whether `OutOfMemoryError` is a memory leak (heap) or a classloader leak (Metaspace).
- **Writing a custom classloader.** Plugin systems, hot-reload tooling, and framework magic (Spring's CGLIB proxies, Hibernate's bytecode enhancement) all use custom classloaders or bytecode generation. Knowing how classloaders delegate and how class identity works prevents subtle bugs.
- **Reading a flame graph or a `javap` disassembly.** When performance is off, you read the JIT's output or the bytecode. Understanding the method area, constant pool, and operand stack is the foundation for reading that output.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Treating JVM, JRE, and JDK as synonyms | Acronyms used loosely in tutorials | Learn the three-layer model: JDK = dev tools + runtime, JRE = runtime, JVM = execution engine |
| Assuming WORA means identical behavior everywhere | Not accounting for filesystem, locale, charset differences | Use `File.separator`, `Path.of`, charset-aware I/O, and locale-independent formats |
| Running out of Metaspace and assuming it is a heap issue | Confusing PermGen/Metaspace with the Java heap | Check which `OutOfMemoryError` you got — heap vs. Metaspace — and look for classloader leaks or too many dynamic classes |
| Getting a `ClassCastException` for a class that "is the same" | Two instances of the same class loaded by different classloaders are different types | Understand class identity = name + classloader; align classloaders or refactor |
| Infinite recursion without realizing the stack is bounded | Assuming the JVM can recurse forever | Use iteration, increase stack size with `-Xss` only as a last resort, and refactor recursive algorithms that can be deep |
| Assuming the JIT optimizes a short benchmark | Running a microbenchmark for too short a time | Use JMH, or at least warm up the JVM before measuring |
| Trying to replace a core JDK class with your own | Assuming classpath order overrides bootstrap classes | Understand parent-delegation; core classes are always loaded by the bootstrap classloader; use a different package or a wrapper instead |

## For the Practice Lab

In the lab, you will inspect a compiled class file with `javap -c` to read the bytecode of a simple method. You will then write a small program that prints its own classloader hierarchy to confirm the parent-delegation model. Then you will deliberately trigger a `StackOverflowError` with deep recursion and a `OutOfMemoryError` with a heap-filling loop, and observe the difference in the error messages. Finally, you will write a minimal custom classloader that loads a class from a byte array and use it to load two copies of the same class to see the class-identity behavior firsthand.

## Summary

The JDK is the development kit (compiler + tools + runtime), the JRE is the runtime environment (JVM + core libraries), and the JVM is the virtual machine that loads bytecode, verifies it, executes it (interpreting and JIT-compiling hot methods to native code), and manages memory (heap, stack, method area, PC registers). The heap holds objects and is managed by the garbage collector, usually split into young and old generations; each thread has its own stack of method frames and a PC register; the method area (Metaspace) holds class metadata and static variables. Classes are loaded on demand by a hierarchy of classloaders that delegate to parents, which is why you cannot shadow core JDK classes and why the same class loaded by two different classloaders is two different types. The bytecode verifier ensures loaded bytecode is safe before execution. "Write once, run anywhere" means the same bytecode runs on any platform with a JVM — but only if you avoid platform-specific APIs. Understanding this architecture is the foundation for everything that follows: GC tuning, classloader debugging, reflection, dynamic proxies, and native image compilation.
