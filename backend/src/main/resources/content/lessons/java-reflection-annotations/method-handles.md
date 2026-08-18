---
title: Method Handles — Faster, Safer Reflection
module: java-reflection-annotations
order: 4
minutes: 24
topics: ["method handles", "MethodHandles", "invokedynamic", "performance", "modern reflection"]
docs:
  - title: "Method Handles (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandle.html"
  - title: "MethodHandles.Lookup (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandles.Lookup.html"
---

# Method Handles — Faster, Safer Reflection

## The Concept: Reflection, Rethought for Performance

Classic reflection (`Method.invoke`) has two real problems: it's slow (every call does access checks, argument boxing, and dynamic dispatch through layers of machinery), and it's *unsafe* in the modern module system — Java 9+ modules restrict reflective access, which is why you see `--add-opens` flags everywhere.

Java 7 introduced **method handles** (`java.lang.invoke`) to fix both: a typed, JIT-friendly pointer to a method that the runtime can optimize like a direct call, with access checks done *at lookup time* instead of *at every invocation*. Java 7 also introduced `invokedynamic` — the bytecode instruction that method handles power — and today, lambdas, string concatenation, and record accessors are all compiled down to `invokedynamic` with method handles underneath. When you write a lambda, the JVM is already using this machinery.

**The mental model:** `Method.invoke` is like calling a company's switchboard for every call — the operator re-verifies you each time. A `MethodHandle` is like getting the employee's *direct line* after a single verification: the connection is set up once, then used fast. Same destination, drastically less overhead per call.

## Finding a Method Handle: The Lookup

You don't *create* handles directly — you get them from a **`Lookup`**, which is the module-system-aware gatekeeper. The lookup captures the access context (which module you're in), so all access checks happen when you ask for the handle, once:

```java
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;

public class MethodHandleDemo {
    public static void main(String[] args) throws Throwable {
        // 1. The lookup — the key to everything. It knows YOUR module's
        //    access rights, so it can legitimately see your own classes.
        MethodHandles.Lookup lookup = MethodHandles.lookup();

        // 2. MethodType describes the signature: return type first,
        //    then parameter types. toUpperCase() takes nothing, returns String.
        MethodType mt = MethodType.methodType(String.class);

        // 3. Find the virtual (instance) method and get its handle.
        MethodHandle upper = lookup.findVirtual(
                String.class, "toUpperCase", mt);

        // 4. Invoke it — note the receiver comes FIRST.
        Object result = upper.invoke("hello");
        System.out.println(result);        // HELLO

        // With parameters: substring(int, int) -> String.
        MethodType subType = MethodType.methodType(
                String.class, int.class, int.class);
        MethodHandle sub = lookup.findVirtual(String.class, "substring", subType);
        System.out.println((String) sub.invoke("hello world", 0, 5)); // hello
    }
}
```

**Walking through it:** `MethodHandles.lookup()` returns a lookup *in your module's context* — it can see your classes and the public API of others, but respects module boundaries automatically (no `setAccessible` free-for-all). `MethodType` is a precise, immutable signature description — this is what makes handles *typed*, which is what lets the JIT optimize them. `findVirtual` is for instance methods; there are also `findStatic` (static methods), `findConstructor`, and `findGetter`/`findSetter` (fields).

## Invoking: invoke vs invokeExact

Handles offer two invocation styles, differing in how strictly they check types:

```java
MethodHandle upper = ...; // toUpperCase() : () String

// invoke() — permissive: converts/boxes arguments and results as needed.
Object r1 = upper.invoke("hi");          // String -> Object OK

// invokeExact() — strict: types must match the MethodType EXACTLY.
String r2 = (String) upper.invokeExact("hi");  // must be exactly String
// upper.invokeExact((Object) "hi") would throw WrongMethodTypeException!
```

`invoke()` is convenient but does a type adaptation dance; `invokeExact()` skips it, matching the declared `MethodType` precisely. Hot paths use `invokeExact` — and `invokeExact` is what the `invokedynamic` instruction calls, which is how lambdas get their speed.

## The Performance Story: Why Method Handles Win

The crucial difference from `Method.invoke`: **method handles are transparent to the JIT.** When the JVM sees a `MethodHandle` invoked repeatedly, it can *inline* the target method — turning the reflective call into a direct call. Classic `Method.invoke` blocks inlining because the target can change every call (you pass arbitrary `Method` objects). A handle is immutable: it points to one specific target, so the optimizer can treat it like a direct call.

Spring's `ReflectiveMethodInvocation`, Jackson's deserializers, and Mockito's mocks all switched to handles for exactly this reason. The practical rules:

- **Look up once, invoke many.** Lookup is the cost; invocation is near-direct-call speed.
- **Cache the handle**, not the `Method`.
- **Use `invokeExact` in hot paths** to skip adaptation.

## The Safety Story: Access Control at the Right Time

In Java 9+, the module system made reflective access explicit: a class in module A can't reflect into module B's internals without `--add-opens` (an explicit grant). Method handles integrate with this *natively*: the `Lookup` carries your access context, and `findVirtual` refuses calls your context doesn't allow — at lookup time, with a clear error, rather than as an `IllegalAccessException` thrown per-invocation.

For your *own* code, this is strictly better: `lookup()` inside your class sees your privates legitimately (your class can always reflect on itself), and the check happens once at startup. This is why modern frameworks ask you to provide a `Lookup` or use one derived from the target class rather than brute-forcing `setAccessible(true)`.

## A Practical Pattern: Building a Tiny Dynamic Invoker

Method handles shine where you must call methods discovered at runtime — say, a small dispatch table:

```java
import java.lang.invoke.*;
import java.util.Map;
import java.util.HashMap;

public class DispatchDemo {
    public static void main(String[] args) throws Throwable {
        // Build a table: command name -> method handle on a processor.
        Map<String, MethodHandle> handlers = new HashMap<>();
        MethodHandles.Lookup lookup = MethodHandles.lookup();
        Processor p = new Processor();

        handlers.put("add",    lookup.findVirtual(Processor.class, "add",
                MethodType.methodType(int.class, int.class, int.class)));
        handlers.put("mult",   lookup.findVirtual(Processor.class, "multiply",
                MethodType.methodType(int.class, int.class, int.class)));

        // Dispatch dynamically — like a mini framework.
        String command = "add";
        int result = (int) handlers.get(command).invoke(p, 3, 4);
        System.out.println(command + " -> " + result);  // add -> 7

        command = "mult";
        result = (int) handlers.get(command).invoke(p, 3, 4);
        System.out.println(command + " -> " + result);  // mult -> 12
    }

    static class Processor {
        public int add(int a, int b)      { return a + b; }
        public int multiply(int a, int b) { return a * b; }
    }
}
```

This is the skeleton of how frameworks dispatch to handler methods (controllers, event listeners, message handlers): a startup-time scan builds a map of handles, and request-time dispatch is one fast `invoke`.

## Method Handles vs Reflection: When to Use Which

| | `java.lang.reflect` | `java.lang.invoke` |
|---|---|---|
| Readability of introspection | Excellent (`getMethods()`, `getDeclaredFields()`) | Lower-level (`MethodType`, `findVirtual`) |
| Invocation speed (hot paths) | Slower, blocks inlining | Near-direct-call, JIT-friendly |
| Access control | `setAccessible` fights the module system | `Lookup` respects modules natively |
| Typed signatures | No — args are `Object...` | Yes — `MethodType` is exact |
| Typical use | General introspection, tooling | Framework internals, hot dispatchers |

**The practical guidance:** for *inspecting* things (listing methods, reading annotations) use `java.lang.reflect` — it's the readable API. For *invoking* things repeatedly (dispatch tables, proxies, serializers) use method handles. Spring uses both: reflection to discover, handles to call.

## Recap

Method handles are typed, immutable, JIT-friendly pointers to methods, obtained from a `MethodHandles.Lookup` and described by precise `MethodType` signatures. They're faster than classic reflection (the JIT can inline them like direct calls), safer in the module system (access checked once at lookup), and they power modern Java's own machinery — lambdas and `invokedynamic` compile down to them. Use reflection for introspection, handles for invocation; look up once and cache; and prefer `invokeExact` on hot paths. That's the toolkit modern frameworks use to stay fast and modular — and now it's in yours.
