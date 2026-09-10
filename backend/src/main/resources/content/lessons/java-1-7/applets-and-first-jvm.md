---
title: Java 1.0 (1996) — Applets, AppletContext and the First JVM
summary: Where Java actually began — the 1995 Oak→Java rename, the HotJava browser demo, applets that downloaded bytecode into a web page, and the tiny standard library of 1.0. Understanding what the first release promised explains most of the JVM design you still use.
order: 1
minutes: 10
topics: [Java 1, Applets, JVM history, Bytecode, Write Once Run Anywhere]
docs:
  - https://dev.java/history/
  - https://en.wikipedia.org/wiki/Java_version_history
capstone: false
---

## The idea in one sentence

Java 1.0 shipped in January 1996 with one world-changing promise — *compile once, run anywhere a JVM exists* — and its most famous vehicle for that promise was the applet, a little program that a web page downloaded and ran inside your browser.

## The story: from Oak to Java

James Gosling's team at Sun Microsystems started the project in 1991 as **Oak**, a language for interactive television set-top boxes. When that market fizzled, they retargeted the language at the brand-new World Wide Web and renamed it **Java** in 1995. The demo that sold it: a browser called **HotJava** executing a rotating 3D molecule embedded in a page — code downloaded over the network, running *on the visitor's machine*.

On 23 January 1996, **JDK 1.0** shipped publicly. What was actually in the box?

| Piece | What it gave developers |
|---|---|
| `java.lang` | `Object`, `String`, `Math`, `Thread`, exceptions — the core you still touch first |
| `java.util` | `Vector`, `Hashtable`, `Enumeration`, `Date` — the pre-Collections toolset |
| `java.io` | Streams and readers for files |
| `java.net` | Sockets and URLs — networking from day one |
| `java.applet` | The `Applet` class that ran inside browsers |

That's the whole story of 1.0: a small, careful library plus the AWT windowing toolkit, unified by one rule — source compiles to **bytecode**, and bytecode runs wherever a JVM exists.

## Why bytecode was the brilliant part

C/C++ compiled to **machine code** for one CPU + OS combination. A Windows build wouldn't run on a Mac. Java's compiler instead emits bytecode — a portable instruction set for an imaginary CPU — and each platform ships a JVM that translates those instructions to its own machine code.

**Analogy:** C++ is like printing a book in a specific language; Java is like printing a score that any orchestra (JVM) can perform. The same score plays everywhere; each orchestra interprets it locally.

```java
// A program written exactly in the JDK 1.0 style of 1996.
// It still compiles and runs unchanged on today's JVMs —
// that backward compatibility IS the "write once, run anywhere" promise.
public class EraStyle {
    public static void main(String[] args) {
        String name = "Duke";
        int release = 1;
        String banner = String.format("%s waves hello from Java %d", name, release);
        System.out.println(banner);
        System.out.println("Same source, same bytecode story since 1996.");
    }
}
```

**Step by step:**

1. `javac EraStyle.java` produces `EraStyle.class` — bytecode, not machine code.
2. Copy that `.class` to any machine with a JVM.
3. `java EraStyle` — the JVM loads, verifies, and executes it, whatever the OS underneath.
4. `String.format` was there in 1.0's library; the `%s`/`%d` placeholders still format today exactly as they did in 1996.

> 🔧 **Try it:** open the **Practice** tab and run this class. Nothing about it needed changing in 30 years — that stability is why enterprises bet on Java.

## Applets: the killer demo (and why they died)

An applet was a Java class embedded in an HTML page. The browser downloaded the bytecode, a JVM plug-in ran it inside a sandbox — a security fence that blocked file and network access except back to the origin server.

```java
// Conceptual shape of an applet (historical — display only).
// The browser called these methods in order:
public class MoleculeApplet extends Applet {
    public void init()    { /* layout, parameters */ }
    public void start()   { /* page shown — begin */ }
    public void paint(Graphics g) { /* draw a frame */ }
    public void stop()    { /* page hidden — pause */ }
    public void destroy() { /* page closed — release */ }
}
```

**Step by step:**

1. Page loads → browser downloads `MoleculeApplet.class`.
2. Plug-in JVM runs `init()`, then `start()`.
3. Every repaint calls `paint(Graphics)` — your drawing code.
4. Leave the page → `stop()`, later `destroy()`.

That lifecycle — *hooks the container calls at the right moments* — is the deepest idea applets left behind. Spring calls it `@PostConstruct`/`@PreDestroy`; Android calls it `onCreate`/`onDestroy`. You will write that pattern for the rest of your career.

Why they died: browsers dropped plug-in support, and the sandbox was either too weak (constant security patches) or too strong (no real capabilities). Applets were officially removed in **Java 11 (2018)** — but by then the web had moved on entirely.

## What 1.0 got right — and what hurt

**Right:**

- Bytecode + JVM portability, memory safety, automatic garbage collection. C++ developers were losing weeks to dangling pointers; Java made those bugs impossible.
- Threads were **built into the language** from day one — `new Thread().start()`, no OS-specific API.
- A loaded class could be **verified** before running — the first line of the sandbox.

**Hurt (and what later releases fixed):**

| 1.0 pain | Fixed in |
|---|---|
| `Vector`/`Hashtable` hold `Object` — cast everything, mistakes crash at runtime | **Java 5** generics (lesson 3) |
| `Enumeration` with clunky `hasMoreElements()` | **Java 2** Collections Framework (lesson 2) |
| Inner classes cannot be static nested; no nested top-level classes | **Java 1.1** cleaned this up |
| `Date` with mutable, 1900-based years | **Java 8** `java.time` |
| No reflection | **Java 1.1** added it |

## Why this matters to you today

- Every Spring Boot service you'll deploy in this course is the *same bytecode-portability story* — you'll build once in Docker and run anywhere containers run.
- The lifecycle pattern applets pioneered is everywhere in backend code: `InitializingBean`, `SmartLifecycle`, Kafka consumer hooks, servlet `init`/`destroy`.
- When you read `java.lang.Object`, `String`, `Thread` — you are reading the 1.0 core that everything since has grown around.

## Common misconceptions

| Misconception | Reality |
|---|---|
| "Java 1.0 was primitive, so nothing survives from it" | `Object`, `String`, `Thread`, exceptions and the bytecode model are all 1.0 — nearly unchanged since |
| "Applets failed, so Java's browser era was a dead end" | The browser era made Java famous and funded the platform; the *technology* moved server-side where it dominates today |
| "Write once, run anywhere was marketing" | It genuinely works — it's why one Docker image can run on any cloud |

## Quick check

1. What did Java compile to instead of machine code, and why?
2. Name two methods of the applet lifecycle and their modern equivalents.
3. Which 1.0 pain does Java 5's generics fix?

<!-- answers: bytecode for JVM portability; init/destroy vs @PostConstruct/@PreDestroy; no more Object casts / runtime ClassCastExceptions -->

## References

- [dev.java — the official OpenJDK site](https://dev.java/history/)
- [en.wikipedia.org/wiki/Java_version_history](https://en.wikipedia.org/wiki/Java_version_history)
- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/lang/enhancements.html)
