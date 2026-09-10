---
title: Method Handles — The Modern Reflection Alternative
summary: What MethodHandles are, how they compare to reflection, lookup contexts, performance characteristics, and when to use them in framework code.
order: 5
minutes: 20
topics: [method-handles, reflection, lookup, invoke, performance, jmh, mh-invoke]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/invoke/MethodHandles.html
---

## The Concept, From Zero

Method handles are Java's modern alternative to `java.lang.reflect`. They provide direct access to methods, constructors, and fields — but with better performance because they can be optimized by the JVM (inlined, compiled, etc.).

// Old way: reflection
Method m = String.class.getMethod("length");
int len = (int) m.invoke("hello");  // 5

// New way: method handle
MethodHandle mh = MethodHandles.lookup()
    .findVirtual(String.class, "length", MethodType.methodType(int.class));
int len = (int) mh.invokeExact("hello");  // 5

Method handles look similar to reflection but are fundamentally different: they're designed to be JIT-optimized, while reflection always goes through slow lookup.

---

## MethodHandle Basics

### Creating a MethodHandle


**What this code does — step by step:**

1. Lookup context — what you can access
2. Find an instance method
3. `String.class,` — declaring class
4. `"toUpperCase",` — method name
5. `MethodType.methodType(String.class)` — return type (no params)
6. Invoke it
7. `String result = (String) mh.invokeExact("hello");` — "HELLO"

The same code, clean:

```java
import java.lang.invoke.*;

MethodHandles.Lookup lookup = MethodHandles.lookup();

MethodHandle mh = lookup.findVirtual(
    String.class,
    "toUpperCase",
    MethodType.methodType(String.class)
);

String result = (String) mh.invokeExact("hello");
```

### MethodType

Describes the method signature (parameter types + return type):

// No parameters, returns String
MethodType noArgs = MethodType.methodType(String.class);

// One String parameter, returns boolean
MethodType oneArg = MethodType.methodType(boolean.class, String.class);

// Two parameters
MethodType twoArgs = MethodType.methodType(void.class, String.class, int.class);

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. 1. Find and invoke an instance method
2. `System.out.println("add(3, 4) = " + sum);` — 7
3. 2. Find and invoke a static method
4. `System.out.println("valueOf(\"42\") = " + num);` — 42
5. 3. Bind a parameter (partial application)
6. `System.out.println("addTen(5) = " + result);` — 15
7. 4. Convert types automatically
8. Method handles can auto-box, auto-unbox, and convert types
9. 5. Performance comparison
10. MethodHandle is typically 2-10x faster after JIT warmup

The same code, clean:

```java
import java.lang.invoke.*;
import java.lang.reflect.*;
import java.util.function.*;

public class MethodHandleDemo {

    static class Calculator {
        public int add(int a, int b) { return a + b; }
        public double multiply(double a, double b) { return a * b; }
        public String format(String template, Object... args) {
            return String.format(template, args);
        }
    }

    public static void main(String[] args) throws Throwable {
        Calculator calc = new Calculator();
        MethodHandles.Lookup lookup = MethodHandles.lookup();

        MethodHandle add = lookup.findVirtual(
            Calculator.class, "add",
            MethodType.methodType(int.class, int.class, int.class)
        );
        int sum = (int) add.invoke(calc, 3, 4);
        System.out.println("add(3, 4) = " + sum);

        MethodHandle valueOf = lookup.findStatic(
            Integer.class, "valueOf",
            MethodType.methodType(Integer.class, String.class)
        );
        Integer num = (Integer) valueOf.invoke("42");
        System.out.println("valueOf(\"42\") = " + num);

        MethodHandle addTen = add.bindTo(calc).bindTo(10);
        int result = (int) addTen.invoke(5);
        System.out.println("addTen(5) = " + result);

        MethodHandle add2 = lookup.findVirtual(
            Calculator.class, "add",
            MethodType.methodType(int.class, int.class, int.class)
        );
        MethodHandle addWithConversion = add2.asType(
            MethodType.methodType(Object.class, Object.class, Object.class)
        );

        long start = System.nanoTime();
        for (int i = 0; i < 1_000_000; i++) {
            add.invoke(calc, 1, 2);
        }
        long mhTime = System.nanoTime() - start;

        Method reflectMethod = Calculator.class.getMethod("add", int.class, int.class);
        start = System.nanoTime();
        for (int i = 0; i < 1_000_000; i++) {
            reflectMethod.invoke(calc, 1, 2);
        }
        long reflectTime = System.nanoTime() - start;

        System.out.println("MethodHandle: " + mhTime / 1_000_000 + "ms");
        System.out.println("Reflection:   " + reflectTime / 1_000_000 + "ms");
    }
}
```

---

## MethodHandle vs Reflection

| Aspect | Reflection | MethodHandle |
|--------|-----------|--------------|
| Lookup | `Class.getMethod()` | `MethodHandles.Lookup` |
| Invocation | `method.invoke(obj, args)` | `mh.invoke(obj, args)` |
| Type safety | Runtime only | Compile-time type checking possible |
| Performance | Slow (always through JVM) | Fast (JIT can inline) |
| API complexity | Simple | More verbose |
| Readability | Good | Poor at first |
| Use in frameworks | Everywhere (Spring, Hibernate) | Newer frameworks, LambdaMetafactory |

---

## Real-World Scenarios

### Scenario 1: Fast serialization

// Method handles for fast field access in serialization
MethodHandles.Lookup lookup = MethodHandles.lookup();
MethodHandle getName = lookup.findGetter(User.class, "name", String.class);
MethodHandle getAge = lookup.findGetter(User.class, "age", int.class);

// Faster than field.get(user) for millions of objects
for (User user : users) {
    String name = (String) getName.invoke(user);
    int age = (int) getAge.invoke(user);
    // serialize...
}

### Scenario 2: LambdaMetafactory (method handle + lambda)


**What this code does — step by step:**

1. Create a functional interface implementation from a method handle
2. `lookup,` — lookup context
3. `"apply",` — functional interface method name
4. `MethodType.methodType(Object.class, Object.class),` — SAM type
5. `MethodType.methodType(Integer.class, String.class),` — impl type
6. `MethodType.methodType(int.class, String.class)` — adapted type
7. `System.out.println(length.apply("hello"));` — 5

The same code, clean:

```java
import java.lang.invoke.*;

public class Main {

    public static void main(String[] args) {

        Function<String, Integer> length = (Function<String, Integer>)
            LambdaMetafactory.metafactory(
                lookup,
                "apply",
                MethodType.methodType(Object.class, Object.class),
                MethodType.methodType(Integer.class, String.class),
                lookup.findVirtual(String.class, "length", MethodType.methodType(int.class)),
                MethodType.methodType(int.class, String.class)
            ).invoke();

        System.out.println(length.apply("hello"));
    }
}
```

### Scenario 3: Framework method invocation

// Spring-style method invocation with method handles
public Object invokeService(Object service, String methodName, Object... args) throws Throwable {
    MethodType type = MethodType.methodType(
        Object.class,
        Arrays.stream(args).map(Object::getClass).toArray(Class[]::new)
    );
    MethodHandle mh = MethodHandles.lookup().findVirtual(
        service.getClass(), methodName, type
    );
    return mh.invoke(service, args);
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using reflection when MH works | Missing performance gains | Switch to MethodHandles for hot paths |
| Calling `invoke()` instead of `invokeExact()` | Loses type information, slower | Use `invokeExact()` when types match exactly |
| Not binding parameters | Syntax is verbose | Use `bindTo()` for partial application |
| Creating MH in a loop | Lookup is expensive | Cache MethodHandles as fields or constants |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/java/annotations/)
