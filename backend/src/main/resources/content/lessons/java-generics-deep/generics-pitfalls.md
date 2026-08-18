---
title: Generics Pitfalls — Raw Types, Arrays, and Real-World Rules
module: java-generics-deep
order: 5
minutes: 25
topics: ["raw types", "generic arrays", "varargs", "type tokens", "best practices"]
docs:
  - title: "Generics Best Practices (Effective Java summaries)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/restrictions.html"
  - title: "Restrictions on Generics (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/restrictions.html"
---

# Generics Pitfalls — Raw Types, Arrays, and Real-World Rules

## The Concept: Where Generics Bite

You now understand the mechanics of generics — parameters, wildcards, erasure. This lesson is about the places real code gets hurt: the subtle traps that produce confusing compiler errors or, worse, runtime `ClassCastException`s in code that "looked fine." Every trap in this lesson is a direct consequence of one fact you already know: **generics are erased at runtime.** When you internalize that, each "weird" rule below becomes obviously necessary rather than arbitrary.

## Pitfall 1: Raw Types — The Quiet Safety Killer

A **raw type** is a generic class used without type arguments: `List list = new ArrayList();` instead of `List<String>`. It exists for backward compatibility, but using one disables all compile-time checking on that reference:

```java
import java.util.*;

public class RawTypeDemo {
    public static void main(String[] args) {
        List raw = new ArrayList();          // raw type — NO checking
        raw.add("hello");                     // fine
        raw.add(42);                          // also fine — raw accepts anything

        List<String> strings = raw;           // unchecked warning!
        // The compiler can't verify it, but now strings "claims" to hold
        // only Strings while actually holding an Integer.

        // BOOM: cast to String at runtime, Integer inside — ClassCastException
        // String first = strings.get(0);
    }
}
```

**Why it's dangerous:** the raw `List` and the `List<String>` are the same class at runtime (erasure!). The compiler simply stops checking at the raw reference, and the wrong-typed object sails through into a supposedly typed collection. The exception then explodes at the *consumer*, far from the code that made the mistake.

**The rules for clean code:**
- Never write a raw type. `new ArrayList<>()` with the diamond is always available.
- Treat every unchecked warning as a defect to fix, not noise to ignore.
- When interop with legacy (pre-generics) code forces a raw type, isolate it behind a small, well-commented adapter so the unsafe surface stays tiny.
- `@SuppressWarnings("unchecked")` is a scalpel, not a hammer: apply it to the smallest scope possible, with a comment proving why the cast is safe.

## Pitfall 2: Arrays and Generics Don't Mix

Arrays are **reified** — they know and enforce their component type at runtime. `new String[5]` throws `ArrayStoreException` if you try to store a `Date`. Generics are erased — `List<String>` has no runtime knowledge. These two natures conflict, and the compiler picks a side: **generic array creation is illegal.**

```java
// ALL of these are compile errors:
// T[] array = new T[5];                    // cannot create array of T
// List<String>[] array = new List<String>[5]; // generic array creation

// The escape hatch — an unchecked cast:
@SuppressWarnings("unchecked")
T[] array = (T[]) new Object[5];   // works, but pollutes the heap if misused
```

**Why does it matter?** Consider what would happen if generic arrays were allowed:

```java
// Hypothetical (illegal) code:
List<String>[] array = new List<String>[2];
Object[] objArray = array;              // arrays are covariant: List[] IS-A Object[]
objArray[0] = new ArrayList<Integer>(); // sneaks an Integer-list in
String s = array[0].get(0);             // ClassCastException — Integer pulled as String
```

The array's runtime check (`ArrayStoreException`) would protect you — but only for the *component type* (`List`), not the *type argument* (`String`). Since the JVM can't see `String`, no runtime check can catch the bad element. The `ClassCastException` fires later, at the read. The compiler therefore bans the whole construct. **Practical rule: prefer `List<T>` over `T[]` whenever you're writing generic code.** Lists are the generic-friendly collection.

## Pitfall 3: Varargs and the Heap Pollution Warning

Generic varargs — `void printAll(List<String>... lists)` — is *technically* a generic array creation, so the compiler warns about heap pollution. But varargs are too useful to ban, so the language allows them with a warning. The danger pattern:

```java
import java.util.*;

public class VarargsDemo {
    // This method forwards varargs to another varargs method. If the
    // receiver stores the array somewhere typed differently, pollution.
    @SafeVarargs
    static void printAll(List<String>... lists) {
        for (List<String> list : lists) {
            System.out.println(list);
        }
    }

    public static void main(String[] args) {
        printAll(List.of("a"), List.of("b", "c"));  // fine
    }
}
```

The rules: if your varargs method *only reads* the varargs array and never stores it, marks it with `@SafeVarargs` to silence the warning honestly. If it stores or returns the array, the warning is real — don't suppress it. `@SafeVarargs` is a promise to the caller that no heap pollution can escape; breaking that promise defeats the safety generics provide.

## Pitfall 4: The ClassCastException "Nowhere"

A frequent bug report: "my code has no casts, but I get ClassCastException." The answer is always the same — there *is* a cast; the compiler inserted it during erasure, at a read point, and the wrong-typed value came from a raw type, an unchecked cast, a legacy API, or a serialization/deserialization boundary (JSON → object, database → entity). When you see this exception, look for: raw types, `(List<String>)` unchecked casts, deserialization code, and mixed-type collections. The fix is usually to find the *write* side and type it properly, not to patch the read.

## Pitfall 5: The Type Token Pattern

Sometimes you genuinely need to know a generic type at runtime — for a generic DAO, a mapper, a serializer. The standard solution is the **type token**: pass the `Class<T>` explicitly:

```java
public class JsonMapper {
    // The caller supplies the runtime class, which erasure cannot provide.
    public <T> T fromJson(String json, Class<T> type) {
        // ... use type to drive deserialization
        return null; // illustrative
    }
}

// Call site:
// User u = jsonMapper.fromJson(json, User.class);
```

For nested generics like `List<User>`, a plain `Class` can't express it — that's why Spring and Jackson use `ParameterizedTypeReference<List<User>>` or `TypeReference<List<User>>`, which capture the full generic type at compile time (through the generic-superclass reflection trick) and hand it to the runtime. As a library author, accepting a type token instead of guessing is what makes your API both safe and flexible.

## Pitfall 6: Overloading on Erasure

Two methods that differ only in type arguments are the *same method* after erasure:

```java
// Compile error — identical erasure:
// void handle(List<String> l) { }
// void handle(List<Integer> l) { }
```

Both erase to `void handle(List)`. If you genuinely need to dispatch on the element type, you cannot — the JVM has no information to dispatch on. Rename the methods, or pass a `Class` token and branch inside one method.

## Best-Practice Checklist

1. **Use the diamond everywhere:** `new ArrayList<>()`.
2. **Prefer `List<T>` to `T[]`** in generic code.
3. **Never mix raw and parameterized types** on the same collection.
4. **Bound parameters to what you actually need** — `Comparable<T>`, `Number`, `CharSequence`.
5. **Use PECS for API parameters** (`? extends` for producers, `? super` for consumers) so your API is maximally usable.
6. **Keep unchecked warnings at zero**, suppressing only with justification.
7. **Provide type tokens** (`Class<T>` or `TypeReference<T>`) at library boundaries where erasure hides needed information.
8. **Name type parameters meaningfully** in public APIs (`T`, `E`, `K`, `V`, `R`) and use `@param` Javadoc to explain what each represents.

## Recap

Every generics pitfall reduces to erasure: raw types disable checking, arrays conflict with erasure (so generic arrays are banned), varargs arrays carry the same risk (so `@SafeVarargs` is a promise), and "mystery" `ClassCastException`s are erased casts on polluted data. The remedies are equally principled: never use raw types, prefer `List<T>`, isolate unchecked casts, and pass type tokens when runtime type information matters. Follow these rules and the compiler becomes an ally that catches whole categories of bugs before your code ever ships.
