---
title: Method Handles — The Modern Reflection Alternative
summary: What MethodHandles are, how they compare to reflection, lookup contexts, performance characteristics, and when to use them in framework code.
order: 4
minutes: 20
topics: [method-handles, reflection, lookup, invoke, performance, jmh, mh-invoke]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/invoke/MethodHandles.html
---

## The Concept, From Zero

Method handles are Java's modern alternative to `java.lang.reflect`. They provide direct access to methods, constructors, and fields — but with better performance because they can be optimized by the JVM (inlined, compiled, etc.).

```java
// Old way: reflection
Method m = String.class.getMethod("length");
int len = (int) m.invoke("hello");  // 5

// New way: method handle
MethodHandle mh = MethodHandles.lookup()
    .findVirtual(String.class, "length", MethodType.methodType(int.class));
int len = (int) mh.invokeExact("hello");  // 5
```

Method handles look similar to reflection but are fundamentally different: they're designed to be JIT-optimized, while reflection always goes through slow lookup.

---

## MethodHandle Basics

### Creating a MethodHandle

```java
import java.lang.invoke.*;

// Lookup context — what you can access
MethodHandles.Lookup lookup = MethodHandles.lookup();

// Find an instance method
MethodHandle mh = lookup.findVirtual(
    String.class,                    // declaring class
    "toUpperCase",                   // method name
    MethodType.methodType(String.class) // return type (no params)
);

// Invoke it
String result = (String) mh.invokeExact("hello");  // "HELLO"
```

### MethodType

Describes the method signature (parameter types + return type):

```java
// No parameters, returns String
MethodType noArgs = MethodType.methodType(String.class);

// One String parameter, returns boolean
MethodType oneArg = MethodType.methodType(boolean.class, String.class);

// Two parameters
MethodType twoArgs = MethodType.methodType(void.class, String.class, int.class);
```

---

## Line-by-Line Walkthrough

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

        // 1. Find and invoke an instance method
        MethodHandle add = lookup.findVirtual(
            Calculator.class, "add",
            MethodType.methodType(int.class, int.class, int.class)
        );
        int sum = (int) add.invoke(calc, 3, 4);
        System.out.println("add(3, 4) = " + sum);  // 7

        // 2. Find and invoke a static method
        MethodHandle valueOf = lookup.findStatic(
            Integer.class, "valueOf",
            MethodType.methodType(Integer.class, String.class)
        );
        Integer num = (Integer) valueOf.invoke("42");
        System.out.println("valueOf(\"42\") = " + num);  // 42

        // 3. Bind a parameter (partial application)
        MethodHandle addTen = add.bindTo(calc).bindTo(10);
        int result = (int) addTen.invoke(5);
        System.out.println("addTen(5) = " + result);  // 15

        // 4. Convert types automatically
        MethodHandle add2 = lookup.findVirtual(
            Calculator.class, "add",
            MethodType.methodType(int.class, int.class, int.class)
        );
        // Method handles can auto-box, auto-unbox, and convert types
        MethodHandle addWithConversion = add2.asType(
            MethodType.methodType(Object.class, Object.class, Object.class)
        );

        // 5. Performance comparison
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
        // MethodHandle is typically 2-10x faster after JIT warmup
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

```java
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
```

### Scenario 2: LambdaMetafactory (method handle + lambda)

```java
// Create a functional interface implementation from a method handle
import java.lang.invoke.*;

Function<String, Integer> length = (Function<String, Integer>)
    LambdaMetafactory.metafactory(
        lookup,  // lookup context
        "apply", // functional interface method name
        MethodType.methodType(Object.class, Object.class), // SAM type
        MethodType.methodType(Integer.class, String.class), // impl type
        lookup.findVirtual(String.class, "length", MethodType.methodType(int.class)),
        MethodType.methodType(int.class, String.class)  // adapted type
    ).invoke();

System.out.println(length.apply("hello"));  // 5
```

### Scenario 3: Framework method invocation

```java
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
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using reflection when MH works | Missing performance gains | Switch to MethodHandles for hot paths |
| Calling `invoke()` instead of `invokeExact()` | Loses type information, slower | Use `invokeExact()` when types match exactly |
| Not binding parameters | Syntax is verbose | Use `bindTo()` for partial application |
| Creating MH in a loop | Lookup is expensive | Cache MethodHandles as fields or constants |
