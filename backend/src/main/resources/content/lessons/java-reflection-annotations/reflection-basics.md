---
title: Reflection Basics — Inspecting Classes at Runtime
module: java-reflection-annotations
order: 1
minutes: 26
topics: ["reflection", "Class objects", "method invocation", "field access", "performance"]
docs:
  - title: "The Reflection API (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/reflect/index.html"
  - title: "Class (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Class.html"
---

# Reflection Basics — Inspecting Classes at Runtime

## The Concept: When Code Needs to Talk About Code

Normally, a program works *with* objects: you call methods, read fields, pass values. **Reflection** is the ability of a running program to inspect *itself* — to ask questions like "what methods does this class have?", "what's the type of this field?", "can I call a method whose name I only know as a string?" — and then act on the answers. It's code that treats classes, methods, and fields as *data*.

**The mental model:** think of a class as a building and an object as a person inside it. Normally you walk in the front door and use the rooms you know exist (compile-time calls). Reflection gives you the *building plans*: you can read the floor plan, find rooms you never knew about, and even open doors marked private. The plans are the `Class` object; the doors are `Method`, `Field`, and `Constructor` objects.

**Why does this exist?** Because whole categories of tools must work with classes they never compiled against: Spring's dependency injection discovers beans by scanning classes; Jackson serializes any object to JSON without knowing its type; test frameworks find `@Test` methods; debuggers and IDEs inspect running objects. None of these could exist without reflection — they'd need to be recompiled for every new class you write.

## The Gateway: Every Object Knows Its Class

Reflection always starts from a `Class<?>` object, and there are three ways to get one:

```java
public class ReflectionBasics {
    public static void main(String[] args) throws Exception {
        // Way 1: the .class literal — compile-time known class.
        Class<String> c1 = String.class;

        // Way 2: from an instance — the object tells you its class.
        String hello = "hello";
        Class<?> c2 = hello.getClass();

        // Way 3: by name — the power move. The name is a runtime string,
        // so the class doesn't even need to exist at compile time.
        Class<?> c3 = Class.forName("java.util.ArrayList");

        System.out.println(c1.getName());   // java.lang.String
        System.out.println(c2.getName());   // java.lang.String
        System.out.println(c3.getName());   // java.util.ArrayList

        // What IS a Class object? It's the runtime description of a type:
        System.out.println(c3.getSimpleName());   // ArrayList
        System.out.println(c3.getPackageName());  // java.util
        System.out.println(c3.isInterface());     // false
    }
}
```

**Walking through it:** `Class.forName("java.util.ArrayList")` is the line that unlocks reflection's power — the class name is a *string*, so you can load classes your code never mentions: plugins, drivers, dynamically configured beans. Notice `getClass()` on an instance returns the *runtime* class — for `ArrayList` it returns `ArrayList.class`, even if the variable's declared type was `List`. That runtime truth is exactly what frameworks need.

## Inspecting a Class: Methods, Fields, Constructors

```java
import java.lang.reflect.*;

public class InspectDemo {
    public static void main(String[] args) {
        Class<?> clazz = java.util.ArrayList.class;

        System.out.println("=== PUBLIC METHODS ===");
        // getMethods(): public methods incl. inherited ones.
        for (Method m : clazz.getMethods()) {
            System.out.println("  " + m.getReturnType().getSimpleName() +
                               " " + m.getName() + "(" +
                               params(m) + ")");
        }

        System.out.println("=== DECLARED (incl. private, incl. only this class) ===");
        for (Field f : clazz.getDeclaredFields()) {
            System.out.println("  " + Modifier.toString(f.getModifiers()) +
                               " " + f.getType().getSimpleName() + " " + f.getName());
        }
    }

    static String params(Method m) {
        StringBuilder sb = new StringBuilder();
        for (Class<?> p : m.getParameterTypes()) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(p.getSimpleName());
        }
        return sb.toString();
    }
}
```

**The key distinction to internalize:** `getMethods()` returns **public** methods including inherited ones (you see `Object`'s `toString`, `equals`, `hashCode` too); `getDeclaredMethods()` returns **all** methods declared in this class itself — including `private` ones — but *not* inherited. Same rule for `getFields()` vs `getDeclaredFields()`. That "declared" variant is the famous private-access door.

## Calling Methods Dynamically

```java
import java.lang.reflect.Method;

public class InvokeDemo {
    public static void main(String[] args) throws Exception {
        // The method name is just a string — decided at runtime.
        String methodName = "toUpperCase";

        Object target = "hello world";
        Class<?> clazz = target.getClass();

        // Find the method by name + parameter types.
        Method m = clazz.getMethod(methodName);      // toUpperCase()
        // Invoke it on the target object. Returns Object — cast as needed.
        Object result = m.invoke(target);

        System.out.println(result);    // HELLO WORLD

        // With parameters: find the 2-arg substring(int, int).
        Method sub = clazz.getMethod("substring", int.class, int.class);
        Object sliced = sub.invoke(target, 0, 5);
        System.out.println(sliced);    // hello
    }
}
```

**Walking through it:** `getMethod("toUpperCase")` returns the `Method` object describing the method; `invoke(target)` executes it on the given instance. With parameters, you pass the *types* to `getMethod` and the *values* to `invoke`. Notice that everything is dynamic — `methodName` could come from a config file, and the program would still work. That's the superpower (and the danger): the compiler can't verify `methodName` exists, so a typo throws `NoSuchMethodException` at runtime instead of a compile error.

## Accessing Private Fields — and the Cost

```java
import java.lang.reflect.Field;

public class PrivateAccessDemo {
    private static class Secret {
        private final String hidden = "classified";
    }

    public static void main(String[] args) throws Exception {
        Secret s = new Secret();
        Field f = Secret.class.getDeclaredField("hidden"); // private field

        // By default, accessing a private field throws IllegalAccessException.
        // setAccessible(true) overrides the access check:
        f.setAccessible(true);

        String value = (String) f.get(s);
        System.out.println(value);    // classified
    }
}
```

`setAccessible(true)` is the "master key" — it bypasses Java's access control for that member. Frameworks use it constantly (Spring's field injection, ORM hydration, serialization of private state). But it also breaks encapsulation, and in modern Java (17+) it's gated: the `java.lang.reflect` access-control module and `--add-opens` flags exist precisely to stop arbitrary code from reaching into JDK internals. Use it only where you own both sides of the contract.

## Creating Objects Without `new`

```java
import java.lang.reflect.Constructor;

public class NewInstanceDemo {
    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("java.lang.StringBuilder");

        // Find the no-arg constructor and call it:
        Object sb = clazz.getConstructor().newInstance();
        // The returned Object is a real StringBuilder — call through reflection:
        clazz.getMethod("append", String.class).invoke(sb, "Hello from reflection");
        System.out.println(clazz.getMethod("toString").invoke(sb)); // Hello from reflection

        // Or: the convenience method newInstance() — deprecated in 9+ because
        // it bypasses checked-exception transparency; prefer getConstructor().
    }
}
```

This is how dependency-injection frameworks instantiate beans, how `ServiceLoader` loads providers, and how ORMs build entities from database rows — all without the source code knowing the concrete class.

## The Performance Reality — and the Modern Answer

Reflection has genuine costs: each `Method.invoke` call does argument boxing, access checks, and virtual dispatch through a dynamic layer — historically 10–100× slower than direct calls in tight loops. Modern JVMs have improved this dramatically (reflection is *partially* JIT-optimized), but the rule for production code stands:

- **Reflect at initialization, not per-call.** Look up the `Method`/`Field` once, cache it, and reuse it — lookup is the expensive part; invocation is cheap-ish.
- **Prefer method handles** (`MethodHandles.Lookup`) and the `java.lang.invoke` API for hot paths; Spring and Jackson use these.
- **Prefer compile-time alternatives** — interfaces, generics, `Function` references — when the types are actually known. Reflection should solve the *dynamism* problem, not replace ordinary calls out of laziness.

Frameworks do the heavy lifting so you rarely write raw reflection — but when you do, follow the same discipline they do: look up once, cache, and keep the reflective surface small.

## Recap

Reflection lets a running program inspect and manipulate its own classes: `Class<?>` objects describe types, `getMethods()`/`getDeclaredFields()` reveal their members, `invoke()` calls methods by name, and constructors can be instantiated dynamically. It powers Spring, Jackson, ORMs, and test frameworks — everything that must work with classes it never compiled against. The trade-offs are real: names become runtime strings (no compile check), `setAccessible` breaks encapsulation, and per-call reflection is slower than direct calls. Use it at boundaries and initialization, cache your lookups, and let frameworks mediate — that's how the whole ecosystem gets dynamism without chaos.
