---
title: Method Handles — Faster Dynamic Invocation Than Reflection
summary: MethodHandle, MethodType, and MethodHandles.Lookup — the java.lang.invoke package that gives you reflection-like flexibility with JIT-inlinable performance.
order: 81
minutes: 18
topics: [method-handle, method-type, method-handles-lookup, invokedynamic, reflection-performance, dynamic-dispatch]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandle.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandles.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodType.html
---

# Method Handles — Faster Dynamic Invocation Than Reflection

## The concept: reflection's speed, without the reflection overhead

`Method.invoke(Object, args)` is slow because the JVM can't optimize through it — the call site is opaque to the JIT. `MethodHandle` provides the same dynamic invocation but is **inlineable by the JIT**: after a few invocations, the JIT compiles the handle call into direct machine code, approaching the speed of a direct method call.

**The mental model:** reflection is like calling through a switchboard (every call goes through an operator); a MethodHandle is like having the direct number (the JIT wires it straight through after the first few calls).

## Creating method handles

```java
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodType;
import java.lang.invoke.MethodHandles;

// Get a lookup object — the entry point for finding handles
MethodHandles.Lookup lookup = MethodHandles.lookup();

// Find a method handle for a specific method
MethodHandle strlen = lookup.findVirtual(String.class, "length",
                                         MethodType.methodType(int.class));

// Invoke it — like calling the method directly
String str = "hello";
int len = (int) strlen.invoke(str);           // returns 5
// or with exact type checking (slightly faster for JIT):
int len2 = (int) strlen.invokeExact(str);     // returns 5 — but str MUST be a String
```

**Line-by-line breakdown:**
- `MethodHandles.lookup()` — creates a lookup context with the **calling class's access rights**; can only access public methods of other classes, and all methods of its own class
- `findVirtual(String.class, "length", ...)` — finds the `length()` method on `String`; `MethodType.methodType(int.class)` describes the return type (no parameters → just the return type)
- `strlen.invoke(str)` — dynamic invocation; the handle acts like a direct call to `str.length()`
- `invokeExact(str)` — stricter: the argument types must match exactly (the JIT can optimize this better); `invoke(str)` allows widening conversions

## MethodType — describing method signatures

```java
import java.lang.invoke.MethodType;

// MethodType describes parameter and return types
MethodType noArgs = MethodType.methodType(void.class);                         // () -> void
MethodType oneString = MethodType.methodType(String.class, String.class);      // (String) -> String
MethodType twoArgs = MethodType.methodType(int.class, String.class, int.class); // (String, int) -> int

// Append parameters
MethodType withExtra = oneString.appendParameterTypes(double.class);  // (String, double) -> String
MethodType changeReturn = oneString.changeReturnType(int.class);      // (String) -> int
```

## Binding — partial application of arguments

```java
// Bind the first argument (the receiver) — like a method reference
MethodHandle strlen = lookup.findVirtual(String.class, "length",
                                         MethodType.methodType(int.class));

MethodHandle helloLen = strlen.bindTo("hello");  // partially applied: "hello".length()
int len = (int) helloLen.invoke();               // 5 — no arguments needed

// For static methods, bind the first parameter
MethodHandle parse = lookup.findStatic(Integer.class, "parseInt",
                                       MethodType.methodType(int.class, String.class));
MethodHandle parseBase16 = parse.bindTo("16");   // wrong! parseInt's first arg is the string
// Correct: bindTo for static methods binds the first parameter:
MethodHandle parseWithRadix = parse.bindTo(16);  // WRONG — parseInt(String, int)
// Correct way for two-arg static:
MethodHandle parseIntRadix = lookup.findStatic(Integer.class, "parseInt",
    MethodType.methodType(int.class, String.class, int.class));
MethodHandle parseHex = parseIntRadix.bindTo(16);  // bind radix = 16
int hex = (int) parseHex.invoke("FF");             // 255
```

## Dropping, inserting, and collecting arguments

```java
// Drop the first parameter (useful for filtering callbacks)
MethodHandle target = ... // (String, int) -> void
MethodHandle dropped = target.dropArguments(0, String.class);  // (int) -> void

// Insert a constant at the beginning
MethodHandle log = ... // (String) -> void
MethodHandle withPrefix = log.insertArguments(0, "[AUDIT] ");  // () -> void
withPrefix.invoke();  // logs "[AUDIT] "

// Collect an array into varargs
MethodHandle sum = ... // (int, int) -> int
MethodHandle sumArray = sum.asVarargsCollector(int[].class);
int result = (int) sumArray.invoke(new int[]{1, 2, 3, 4});  // 10
```

## MethodHandles.Lookup — access control

```java
// The lookup context determines what you can access
MethodHandles.Lookup publicLookup = MethodHandles.lookup();      // caller's access rights
MethodHandles.Lookup privateLookup = MethodHandles.privateLookupIn(
    MyClass.class, MethodHandles.lookup());  // full access to MyClass's members

// Find private fields/methods (only with the right lookup)
MethodHandle privateMethod = privateLookup.findVirtual(
    MyClass.class, "secretMethod",
    MethodType.methodType(String.class));
```

**Access rules:**
| Lookup type | Can access |
|---|---|
| `lookup()` | Public methods of all classes; protected/package/private of the calling class |
| `privateLookupIn(cls, lookup)` | All members (including private) of `cls` |
| `MethodHandles.publicLookup()` | Only public static methods of public classes |

## MethodHandle vs reflection

| Aspect | MethodHandle | Reflection |
|---|---|---|
| Invocation speed | JIT-inlinable (after warmup, near-direct speed) | Interpreter overhead (10-50× slower) |
| Type checking | `invokeExact` checks types at call site | `invoke` checks at runtime |
| Usability | Comparable to lambdas (can be passed, returned, composed) | Verbose, stringly-typed |
| Access control | `Lookup`-based (compile-time safe) | `setAccessible` (bypasses access checks) |
| Optimization | JIT can inline through the call site | JIT cannot optimize through `Method.invoke` |

**When to use MethodHandles:**
- Framework code that needs dynamic dispatch (serializers, mappers, dependency injection)
- Performance-critical reflection (JSON serialization of 1M objects/sec)
- Replacing `Method.invoke` in hot paths

## Real-world scenario — dynamic mapper

```java
public class DynamicMapper {
    private final Map<Class<?>, MethodHandle> serializers = new HashMap<>();

    public <T> void registerSerializer(Class<T> type, MethodHandle serializer) {
        serializers.put(type, serializer);
    }

    public String serialize(Object obj) throws Throwable {
        MethodHandle handle = serializers.get(obj.getClass());
        if (handle == null) throw new IllegalArgumentException("No serializer for " + obj.getClass());
        return (String) handle.invoke(obj);    // JIT-inlinable after warmup
    }
}

// Registration
DynamicMapper mapper = new DynamicMapper();
MethodHandles.Lookup lookup = MethodHandles.lookup();
MethodHandle jsonSerialize = lookup.findVirtual(JsonUtils.class, "toJson",
    MethodType.methodType(String.class, Object.class));
mapper.registerSerializer(Order.class, jsonSerialize.bindTo(JsonUtils.class));
```

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Using `invoke()` instead of `invokeExact()` | `invoke()` allows widening; JIT can't optimize as aggressively | Use `invokeExact` when types are known; use `invoke` for flexibility |
| Forgetting to bind receiver | `invoke()` with missing args throws `WrongMethodTypeException` | Bind the receiver with `bindTo()` or pass it in `invoke()` |
| Creating handles in a loop | `findVirtual` is expensive; handles should be cached | Cache handles in a `Map<Class, MethodHandle>` |
| Using MethodHandles for simple cases | Overkill if you're calling a known method directly | Use MethodHandles for dynamic/unknown targets only |

## Key takeaways

- `MethodHandle` provides reflection-like dynamic invocation but is JIT-inlinable — near-direct-call speed after warmup.
- `invokeExact` is strict (exact types) and faster; `invoke` allows widening.
- `MethodHandles.Lookup` controls access; `privateLookupIn` gives full access to private members.
- Cache handles in Maps; don't create them in hot loops.
- Use MethodHandles for framework code, serializers, and performance-critical reflection.

**Official docs:** [MethodHandle API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandle.html) · [MethodHandles API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodHandles.html) · [MethodType API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/invoke/MethodType.html)
