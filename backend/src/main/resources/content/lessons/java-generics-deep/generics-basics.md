---
title: Generics Basics — Why Type Parameters Exist
module: java-generics-deep
order: 1
minutes: 24
topics: ["generics", "type safety", "type parameters", "type erasure", "compiler checks"]
docs:
  - title: "Generics (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/index.html"
  - title: "Lesson: Generics (Dev.java)"
    url: "https://dev.java/learn/generics/"
---

# Generics Basics — Why Type Parameters Exist

## The Concept: What Problem Do Generics Solve?

Imagine you are a librarian who receives boxes of books. Before generics existed in Java (before Java 5, released in 2004), every box was simply labeled `Object` — the most general type that can hold anything. That sounded flexible, but it created two daily headaches.

**The first headache: you could put the wrong thing in a box.** If a box was meant for `Book` objects but was typed as `Object`, nothing stopped someone from dropping a `DVD` into it. The mistake was only discovered later, when you pulled an item out and tried to read its pages — and got a runtime crash (`ClassCastException`).

**The second headache: you had to cast on the way out.** Since the box could contain anything, every time you took something out you had to tell the compiler "trust me, this is a Book": `Book b = (Book) box.get();`. Casts are ugly, repetitive, and hide bugs until runtime.

Generics solve both problems with a single idea: **let the type be a parameter of the class or method, decided at the point of use, and have the compiler check it for you.** Instead of a box of `Object`, you write `Box<Book>`. The angle brackets `<Book>` say: "this box is specialized for books." Now the compiler refuses to let you put a DVD in, and when you take something out you get a `Book` directly — no cast, no surprise crashes.

**The mental model to keep:** a generic class is like a template with blank slots. The slots (`<T>`, `<E>`, `<K>`, `<V>`) get filled in with real types when the code is used. The compiler then re-checks your entire program with those slots filled, catching mistakes at compile time instead of production time.

## The Generic Class: A First Full Example

Let's build a simple generic class and walk through every line:

```java
import java.util.ArrayList;
import java.util.List;

// The <T> after the class name declares a type parameter.
// T is a placeholder for "whatever type the user of this class chooses."
public class Box<T> {

    // The field is of type T — the placeholder type.
    // Whatever type fills T, this field will hold that type.
    private T contents;

    // A method that accepts a value of the placeholder type.
    public void put(T item) {
        this.contents = item;
    }

    // A method that returns the placeholder type.
    public T get() {
        return contents;
    }

    // A generic method with its OWN type parameter <E>.
    // This has nothing to do with the class-level T.
    public <E> List<E> wrapInList(E value) {
        List<E> list = new ArrayList<>();
        list.add(value);
        return list;
    }

    public static void main(String[] args) {
        // Here we fill in the slot: this box can ONLY hold strings.
        Box<String> stringBox = new Box<>();
        stringBox.put("hello");          // fine — "hello" is a String
        // stringBox.put(42);            // COMPILE ERROR — 42 is not a String

        String value = stringBox.get();  // no cast needed!
        System.out.println(value);       // prints: hello

        // The same class, with a different type filling the slot:
        Box<Integer> intBox = new Box<>();
        intBox.put(100);
        int n = intBox.get();            // also no cast
        System.out.println(n);           // prints: 100
    }
}
```

**Walking through the code, piece by piece:**

- `public class Box<T>` — the `<T>` after the class name declares that `Box` takes one type parameter. Inside the class body, `T` can be used anywhere a normal type can: field types, method parameters, return types, local variables. By convention, single capital letters are used: `T` for type, `E` for element (collections), `K`/`V` for key/value (maps), `N` for number.

- `private T contents;` — a field whose type is the placeholder. When someone writes `Box<String>`, this field effectively becomes `String contents`.

- `public void put(T item)` — a setter that only accepts the placeholder type. With `Box<String>`, calling `put(42)` is a compile error because the compiler has substituted `String` for `T` and checks every usage against that substitution.

- `public T get()` — a getter that returns the placeholder. Because the compiler knows `get()` returns `String` for a `Box<String>`, you can assign straight to a `String` variable with **no cast**. This is the type safety you gained.

- `public <E> List<E> wrapInList(E value)` — note the `<E>` **before** the return type. This is a *generic method*: it declares its own type parameter that is independent of the class-level `T`. The syntax rule is that any type parameter used in a method must be declared in angle brackets right before the return type. Here, whatever type you pass in becomes `E`, and the method returns a list of exactly that type.

- In `main`, `Box<String>` and `Box<Integer>` use the **same class definition** but the compiler instantiates two distinct, type-checked versions of it. The beauty is you only wrote the class once — the type parameter did the specializing for you.

## What the Compiler Actually Does: Type Erasure

Here is the deep secret that makes Java generics different from C++ templates: **the generic type information exists only at compile time.** The Java compiler uses it to check your code, then *erases* it — it replaces every `T` with `Object` (or with the bound, which we will see later) and inserts the casts for you. This is called **type erasure**.

So `Box<String>` and `Box<Integer>` are, at runtime, the *same* class `Box`. If you write `stringBox.getClass() == intBox.getClass()` it returns `true`. The JVM never knows about `String` or `Integer` being special — the compiler already turned `get()` into `(String) contents` inside a plain `Object`-based class.

**Why does erasure matter to you?**

1. **You cannot check a generic type at runtime.** `if (value instanceof T)` is a compile error — at runtime there is no `T` to check against, only `Object`. This is why you sometimes need to pass a `Class<T>` object as a parameter, so the class can do runtime checks itself.

2. **You cannot create instances of `T`.** `new T()` is illegal, because the JVM has no idea what `T` is. If a generic class needs to construct values, the caller must pass a factory or a `Class<T>` and use reflection.

3. **You cannot have a static field of type `T`.** Static fields belong to the erased class `Box`, shared by all instantiations — a static `T value` would be ambiguous. The compiler rejects it.

4. **Bridging methods appear.** When a generic class implements a generic interface, the compiler sometimes generates hidden *bridge methods* to make overriding work across erasure. You don't write them; just know they exist when you see odd method signatures in decompiled code.

Understanding erasure prevents entire categories of confusion. When you see "unchecked warning" from the compiler, it means: *"you wrote code whose runtime type behavior I can't fully verify, because of erasure."* The classic example is casting a raw `List` to `List<String>` — the compiler trusts you and warns, because at runtime they are the same `List`.

## Why Bother? The Three Concrete Payoffs

**1. Compile-time safety.** The most common generics bug — a `ClassCastException` from a mixed collection — becomes a compile error. For a codebase with thousands of collections, this moves a whole class of bugs to the earliest possible moment: while you're still writing the code.

**2. No casting noise.** Without generics, `List` code is full of `(Book) list.get(0)` casts. With `List<Book>`, the getter returns `Book` directly. Code becomes shorter and easier to read, and each line you delete is a place a cast error could hide.

**3. Self-documenting APIs.** `Map<String, List<Integer>>` tells you instantly what the map holds: string keys mapping to lists of integers. The type is documentation the compiler *enforces* — it can't drift out of date the way comments can.

## The Diamond Operator and Raw Types

Modern Java (since 7) lets you write `Box<String> box = new Box<>();` — the empty `<>` is the **diamond operator**, and the compiler infers the type from the left-hand side. Writing `new Box<String>()` is redundant but harmless.

A **raw type** is a generic class used without any type argument: `Box box = new Box();`. Raw types exist only for backward compatibility with pre-generics code. When you use one, every generic method on it is unchecked — you lose all compile-time safety. Your own code should never use raw types; when you encounter them in legacy code, adding the type arguments is one of the cheapest, safest improvements you can make.

## Common Beginner Mistakes

- **Putting primitives in angle brackets.** `Box<int>` is illegal — type arguments must be reference types. Use the wrapper: `Box<Integer>`. Autoboxing (Java's automatic conversion between `int` and `Integer`) hides the conversion, so `box.put(42)` still works — the compiler boxes the `int` into an `Integer` for you.

- **Assuming `List<String>` is a subtype of `List<Object>`.** It is not, and this is a feature, not a bug. If it were, you could add an `Object` (say, a `Date`) to a `List<String>` by aliasing — breaking type safety. This leads directly to the concept of *wildcards* (`? extends` and `? super`), which are the subject of the next lesson and exist precisely to give you safe flexibility here.

## Recap

Generics are compile-time type parameters: they let one class definition serve many types while the compiler verifies every use. Type erasure means the JVM sees plain `Object`-based classes with inserted casts, which explains why you can't reflect on `T`, instantiate `T`, or use `T` in statics. The payoff is code that fails at compile time instead of production, needs no casts, and documents itself. Master this foundation and the wildcard rules, generic methods, and bounded parameters in the following lessons will feel natural rather than mysterious.
