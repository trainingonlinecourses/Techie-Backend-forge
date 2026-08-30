---
title: Type Erasure — What the JVM Actually Sees
module: java-generics-deep
order: 4
minutes: 26
topics: ["type erasure", "unchecked warnings", "heap pollution", "bridge methods", "reflection"]
summary: Here is the single most important fact about Java generics, and almost every "weird" generics error traces back to it: the JVM has no idea generics...
docs:
  - title: "Type Erasure (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/erasure.html"
  - title: "Effects of Type Erasure (Dev.java)"
    url: "https://dev.java/learn/generics/type-erasure/"
---

# Type Erasure — What the JVM Actually Sees

## The Concept: Generics Are a Compile-Time Illusion

Here is the single most important fact about Java generics, and almost every "weird" generics error traces back to it: **the JVM has no idea generics exist.** When your `.java` file is compiled, the compiler uses the generic types to check your code thoroughly — then it *erases* them. Every `<String>`, `<Integer>`, and `<? extends Number>` is stripped out of the bytecode and replaced with plain types plus inserted casts. This process is called **type erasure**, and it was a deliberate design decision made in 2004 to keep Java backward compatible: code written before Java 5 (which had no generics) still runs on modern JVMs, because the bytecode looks just like the old non-generic bytecode.

**The mental model:** think of generics as sticky notes the compiler uses while checking your work. After the check passes, the notes are removed before the code ships to the JVM. The JVM only ever sees the underlying "raw" class with casts sprinkled in.

## What Exactly Gets Erased?

Let's trace what the compiler does with a generic class. Take our `Box<T>` from the first lesson:

```java
// What YOU write:
public class Box<T> {
    private T contents;
    public void put(T item) { this.contents = item; }
    public T get() { return contents; }
}

// What the compiler emits (roughly) after erasure:
public class Box {
    private Object contents;
    public void put(Object item) { this.contents = item; }
    public Object get() { return contents; }
}
```

And at the call site:

```java
// What YOU write:
Box<String> box = new Box<>();
String s = box.get();

// What the compiler emits:
Box box = new Box();          // no type arguments survive
String s = (String) box.get(); // a cast is inserted for you
```

Notice the key mechanics: `T` was replaced with `Object` (its erasure), and the compiler inserted a cast at the point where you read a value back. The type checking happened at compile time; the runtime only needs the cast to keep the old bytecode contract. This is why your `get()` call can never throw a surprise `ClassCastException` — the compiler already verified that only `String`s went in.

## Bounded Parameters Erase to Their Bound

If a type parameter has a bound, it erases to the bound instead of `Object`:

```java
public static <T extends Comparable<T>> T max(List<T> list) { ... }
// erases to:
public static Comparable max(List list) { ... }
```

That's why the `compareTo` call worked in the previous lesson: after erasure, `T` is `Comparable`, and `Comparable` has `compareTo`. The bound serves double duty — it lets *you* call methods on `T` at compile time, and it determines the erasure.

With multiple bounds `<T extends A & B & C>`, the erasure is the **first** bound (`A`). The others are enforced by casts inserted where needed.

## The Problems Erasure Creates, and the Rules Around Them

Because the JVM can't see type arguments, the compiler must forbid things that would be meaningless at runtime:

**1. No `instanceof T`.** `if (x instanceof T)` is illegal. At runtime `T` is gone; there's nothing to check against. The workaround is to pass the `Class<T>` object: `if (clazz.isInstance(x))`.

**2. No `new T()`.** You cannot construct a `T`, because the JVM doesn't know the constructor to call. Factories and `Class<T>` parameters are the escape hatch: `T value = clazz.getDeclaredConstructor().newInstance();` (with the unavoidable checked exceptions handled).

**3. No `new T[]`.** Array creation needs a concrete runtime type. You can create an `Object[]` and cast it — which produces the famous "generic array creation" warning — or better, use `List<T>` instead of arrays. Arrays and generics mix poorly precisely because arrays are *reified* (they know their runtime component type) while generics are not.

**4. No static fields of type `T`.** Statics are shared across all instantiations of the erased class; one shared field can't be `String` for one usage and `Integer` for another.

**5. No generic exception classes.** `class MyException<T> extends Exception` is illegal. The JVM's exception machinery has no place for a type argument. You can, however, throw a generic *method's* `T` if `T` is bounded by `Throwable` — a niche trick used by libraries.

## Unchecked Warnings and Heap Pollution

When you write:

```java
List<String> strings = new ArrayList();   // raw ArrayList!
```

the compiler can't verify safety, so it emits an **unchecked warning**. The danger: after erasure, that raw `ArrayList` is identical to a `List<Integer>` you might create elsewhere. If you pass the raw list somewhere expecting `List<Integer>`, and it happens to contain a `String`, you get a `ClassCastException` *at runtime* — the one thing generics were supposed to prevent.

This situation — a variable of a parameterized type pointing to an object of a different parameterized type — is called **heap pollution**. The classic breeding ground is mixing raw types with generics, or doing unsafe unchecked casts like `(List<String>) someObject`. The rule for clean code: **never use raw types, and treat every unchecked warning as a bug report.** If a warning is truly unavoidable (some library interop requires it), suppress it narrowly with `@SuppressWarnings("unchecked")` and add a comment explaining *why* it's safe.

## Bridge Methods: Erasure's Hidden Gift

Here's a subtle consequence. Suppose you have:

```java
class Parent implements Comparable<Parent> {
    public int compareTo(Parent other) { ... }
}

class Child extends Parent {
    // Child's erasure of compareTo: compareTo(Child) — a DIFFERENT method
    // than Parent's compareTo(Parent)! Overriding would silently break.
    public int compareTo(Child other) { ... }
}
```

After erasure, `Child.compareTo(Child)` does *not* override `Parent.compareTo(Parent)` — the signatures differ. To preserve polymorphic behavior, the compiler generates a hidden **bridge method**: `compareTo(Parent other) { return compareTo((Child) other); }`. It bridges the erased signature to your real method. You never see bridge methods in source; you'll only notice them in decompiled bytecode or when reflection reports two seemingly duplicate methods. This is erasure working *for* you, keeping virtual dispatch correct.

## Can You Get the Type Back? Yes — With a Trick

The JVM doesn't know about type arguments in *most* places — but there's one famous exception: **generic superclass and field information is kept in the class file** for reflection. The compiler records the *actual* type arguments used in a class declaration (but not in local variables or casts).

```java
import java.lang.reflect.*;
import java.util.List;

public class TypeInfo {
    private List<String> names;   // field — type args survive

    public static void main(String[] args) throws Exception {
        Field f = TypeInfo.class.getDeclaredField("names");
        ParameterizedType pt = (ParameterizedType) f.getGenericType();
        System.out.println(pt.getActualTypeArguments()[0]); // class java.lang.String
    }
}
```

This is how libraries like Jackson, Gson, and Spring's `ParameterizedTypeReference` figure out what type to deserialize into, even though the caller never passes a `Class`. It's the "back door" around erasure that powers huge amounts of framework magic.

## Recap

Type erasure means generics exist only at compile time: `T` becomes `Object` (or its bound), and casts are inserted at read sites. This explains every generics restriction — no `instanceof T`, no `new T[]`, no static `T`, no generic exceptions. It also explains unchecked warnings, which are the compiler telling you it could not verify safety and heap pollution is possible. Bridge methods keep polymorphism intact across erasure, and the generic-supertype metadata gives reflection a narrow back door that frameworks exploit. Internalize erasure and the rest of generics — including the error messages — becomes predictable.
