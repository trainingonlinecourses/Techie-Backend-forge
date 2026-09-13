---
title: Java 22 — The Foreign Function & Memory API (JEP 454, finalized)
summary: After two decades, Java has a supported way to call native libraries and manage off-heap memory — replacing the fragile JNI dance with a safe, designed API. Here's what it replaces, what it looks like, and when you'd reach for it.
order: 6
minutes: 18
topics: [Java 22, JEP 454, FFM, JNI, native, off-heap, Panama]
docs:
  - url: https://openjdk.org/jeps/454
    title: JEP 454 — Foreign Function & Memory API (final)
capstone: false
---

## The idea in one sentence

The Foreign Function & Memory API lets Java code call C libraries and allocate memory outside the heap **through a first-class, safe API** — replacing 25 years of JNI hand-wiring and `sun.misc.Unsafe` hacks.

## The problem it solves

Java has always run inside the JVM's managed world. But real systems need to cross the border: calling a GPU library, a compression codec, OpenSSL, an OS API — or allocating a 10 GB buffer that the garbage collector should never see. Until now the only door was **JNI** (the Java Native Interface), and the door had teeth:

- You hand-wrote C glue code (`javah`-generated headers, `System.loadLibrary`, `native` methods).
- Every argument and return value crossed a marshalling layer you maintained.
- Pointers crossing the border were untyped and unchecked — a wrong offset segfaulted the *whole JVM*, taking down every request it was serving.
- For off-heap memory, most projects bypassed JNI entirely and used `sun.misc.Unsafe` — an internal, unsupported API that newer JDKs actively restrict.

FFM replaces all of this with two linked halves, both built around **memory segments**: `MemorySegment` is a bounded, typed view of memory — on-heap or off-heap — that knows its own size and lifetime, so out-of-bounds access and use-after-free become deterministic exceptions instead of mystery crashes.

## The code, explained

**Off-heap memory, safely** — allocate outside the GC heap, with a lifetime contract:

```java
import java.lang.foreign.Arena;
import java.lang.foreign.MemorySegment;

// Arena controls the LIFETIME of everything allocated inside it.
try (Arena arena = Arena.ofConfined()) {
    MemorySegment buffer = arena.allocate(1024);   // 1024 bytes off-heap
    buffer.setAtIndex(java.lang.foreign.ValueLayout.JAVA_INT, 0, 42);
    int v = buffer.getAtIndex(java.lang.foreign.ValueLayout.JAVA_INT, 0);
    System.out.println(v);                          // 42
}   // arena closed → memory released — deterministically, no GC involved
```

The `Arena` is the safety story in miniature: memory's lifetime is explicit and scoped. Confined arenas can only be touched by their creating thread; shared arenas widen access; an arena closed too early makes any later access throw — not corrupt.

**Calling a native function** — link against a library function symbolically, no glue code:

```java
import java.lang.foreign.*;
import java.lang.invoke.MethodHandle;

// Get a handle to the C library function strlen — no C code written by us.
Linker linker = Linker.nativeLinker();
SymbolLookup stdlib = linker.defaultLookup();
MethodHandle strlen = linker.downcallHandle(
    stdlib.find("strlen").orElseThrow(),
    FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS)
);

try (Arena arena = Arena.ofConfined()) {
    MemorySegment str = arena.allocateUtf8String("hello");
    long len = (long) strlen.invoke(str);           // call C directly
    System.out.println(len);                        // 5
}
```

Read that descriptor like a signature: `of(JAVA_LONG, ADDRESS)` means "returns a C `long`, takes one pointer." The `Linker` handles the calling convention, type conversion, and platform differences that JNI made you write by hand. In the other direction, an `upcall stub` lets C code call *back into* Java (callbacks) with the same machinery.

## Version history — read this like a release engineer

FFM took the modern long road: **JEP 419** (incubator, 17) → **preview** in 19–21 → **final in Java 22** (JEP 454, GA September 2024). That means: on Java 22+ it's production-ready with no flags; on 19–21 it needed `--enable-preview`; before that, incubator modules. If you maintain a library, the JNI fallback still matters for older JDKs — but every roadmap that says "we'll never leave JNI" should be re-read.

Related, same era: **JEP 442 (Foreign Memory in 23/24)** refined the API further, and `Unsafe`-based frameworks (Netty, Kafka clients) are the ones driving the migration — because `sun.misc.Unsafe` memory-access methods now warn and are scheduled for removal.

## Where you'll actually meet it

- **Libraries**: Netty's buffers, the Kafka client, compression and crypto JNI bridges are migrating to FFM — your dependency upgrades will quietly swap JNI for it.
- **Data-heavy backends**: off-heap caches and buffers that must not pressure the GC (a 10 GB `Arena` beats a 10 GB heap any day for predictability).
- **You, rarely directly**: unlike virtual threads, this is not an everyday tool — it's infrastructure. Know it exists, recognize it in a stack trace, and don't write JNI glue in 2026.

## Common Mistakes

- **Ignoring the arena lifetime** — using a `MemorySegment` after its arena closes throws `IllegalStateException`. That's the feature, not a bug: deterministic failure beats corruption.
- **Reaching for FFM when a pure-Java path exists** — calling native code costs marshalling; JNA-style "it's easier" migrations can be slower than the JNI they replaced. Benchmark the border.
- **Confusing `ADDRESS` with `long`** — pointers in descriptors are their own layout; forcing them through `JAVA_LONG` breaks on platforms where they differ.
- **Assuming it removes the need for the native library itself** — FFM binds to it; you still need the `.so`/`.dll` installed and loadable.

## Quick Checklist

- [ ] I can explain what FFM replaces (JNI glue + `Unsafe`) and why safety motivated it.
- [ ] I can allocate off-heap memory in an `Arena` and explain the lifetime contract.
- [ ] I can read a `FunctionDescriptor` and say what native signature it describes.
- [ ] I can state when FFM became final (Java 22, JEP 454) and what that means for older JDKs.

## References

- [JEP 454 — Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [dev.java — The Foreign Function & Memory API](https://dev.java/learn/jvm/foreign/)
- [Oracle — Java 22 release notes](https://www.oracle.com/java/technologies/javase/22-relnote-issues.html)
- [GeeksforGeeks — Java Foreign Function & Memory API](https://www.geeksforgeeks.org/foreign-function-and-memory-api-in-java/)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
