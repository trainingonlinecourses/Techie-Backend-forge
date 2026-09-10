---
title: Java 5 (2004) — Generics, Enums, Autoboxing, Varargs: the Language Revolution
summary: The biggest single-language upgrade in Java's history — compile-time type safety with generics, real enums, autoboxing, varargs and the enhanced for loop. After this release, whole categories of runtime crashes simply became compile errors.
order: 3
minutes: 14
topics: [Java 5, Generics, Enums, Autoboxing, Varargs, Enhanced For]
docs:
  - https://docs.oracle.com/javase/1.5.0/docs/guide/language/
  - https://dev.java/learn/generics/
capstone: false
---

## The idea in one sentence

Java 5 moved errors from **runtime to compile time** — where `Vector`'s casts blew up in production, generics now stop you at `javac`; where ints and wrappers fought, autoboxing bridged them; where constants were `int` flags, enums became real types.

## The headline problem: `List` of *what*, exactly?

Pre-5 collections held `Object`. Every read was a trust-based cast:

```java
// The pre-5 way (display only):
List names = new ArrayList();     // raw — holds ANY object
names.add("Ada");
names.add(Integer.valueOf(42));   // nobody stops this!
String n = (String) names.get(1); // 💥 ClassCastException in production
```

**Generics fix it** by making the collection *typed*: `List<String>` promises every element is a `String`, and the compiler enforces the promise at every insert and read. The cast doesn't move — it disappears.

**Analogy:** raw collections were a shipping box with no label — anything fits, and the receiver guesses the contents. Generics print the manifest on the box; the warehouse (compiler) refuses mislabeled items before they ship.

## Java 5 in action (runnable)

```java
import java.util.*;

public class JavaFive {
    public static void main(String[] args) {
        List<String> langs = new ArrayList<String>();
        langs.add("Java 5");
        langs.add("Java 17");
        System.out.println(langs);

        Integer boxed = 10;
        int unboxed = boxed + 5;
        System.out.println("Autoboxed math: " + unboxed);

        int[] points = {3, 5, 7};
        int sum = 0;
        for (int n : points) {
            sum = sum + n;
        }
        System.out.println("Enhanced-for total: " + sum);
    }
}
```

**What this code does — step by step:**

1. `List<String>` — the type argument travels with the variable; `langs.add(42)` would now be a *compile error*, not a production crash.
2. `Integer boxed = 10;` — **autoboxing**: the compiler silently writes `Integer.valueOf(10)`. The reverse (`int unboxed`) auto-unboxes. No more `new Integer(10)` ceremony.
3. `int[] points = {3, 5, 7};` with `for (int n : points)` — the **enhanced for** loop: read it "for each `int n` in `points`". It replaced index bookkeeping forever and it works over arrays *and* every `Collection`.

> 🔧 **Try it in Practice**, then break it on purpose: change one `langs.add(...)` argument to a number and watch the *compile* fail — that compile-time refusal is the entire point of generics.

### The other headline features (shapes to recognize)

Two more Java 5 giants don't fit the practice editor's runnable subset (it executes JDK calls, not user-declared method invocations or enum types), but you must recognize them on sight — legacy code is full of both:

```java
// Varargs (display only) — "any number of ints, please":
static int total(int... nums) {          // compiler packs args into an array
    int sum = 0;
    for (int n : nums) sum = sum + n;
    return sum;
}
// callers write: total() or total(2) or total(1, 2, 3, 4)

// Enums (display only) — a real, closed type:
enum Level { BEGINNER, INTERMEDIATE, EXPERT }
Level mine = Level.BEGINNER;
boolean starter = (mine == Level.BEGINNER);  // identity == is CORRECT for enums:
                                             // constants are singletons, null-safe
```

**Why these two mattered:** varargs made APIs like `String.format(...)` and `List.of(...)` possible; enums replaced `int` constant flags with types the compiler can check — and today they model every order status and workflow stage you'll ship in Spring.

## Beyond the runnable: what else shipped in the box

Java 5 was enormous. The features below are core backend knowledge — the browser simulator can't model them all, so study the shapes:

```java
// 1. Generic types and methods (display only)
public class Box<T> {
    private T value;
    public void set(T v) { this.value = v; }
    public T get()       { return value; }
}
// Box<String> s = new Box<>(); — one class, reused for every type

// 2. Bounded generics: "T must be Number or below"
static double sum(List<? extends Number> xs) { /* ... */ }

// 3. Enums are full classes: fields, constructors, methods
enum Planet {
    MERCURY(3.303e+23), VENUS(4.869e+24);
    private final double mass;
    Planet(double mass) { this.mass = mass; }
    double mass() { return mass; }
}

// 4. Annotations — metadata the compiler and frameworks read
@Override
public String toString() { return "custom"; }
```

**Why each mattered downstream:**

- `Box<T>` → today's `Optional<User>`, `ResponseEntity<Order>`, `List<LessonDto>` — every Spring API you'll meet is generic.
- Bounded types → the whole `Collections` utility API (`max`, `sort`) is built on `Comparable<? super T>` bounds.
- Enum-with-state → the pattern for finite state machines: order statuses (`NEW, PAID, SHIPPED`), Kafka consumer states, workflow stages. The compiler then *forces* every `switch` to handle all constants — add a status and every unhandled switch refuses to compile.
- `@Override` → opened the door to `@Autowired`, `@GetMapping`, `@Transactional` — Spring is essentially an annotation-driven framework Java 5 made possible.

> 💡 **Watch for:** the wildcard trap. `List<Object>` is *not* a supertype of `List<String>` — that's what `? extends`/`? super` exist for. We go deep in the Generics module later; here, just remember "PECS": **Producer Extends, Consumer Super**.

## Then vs now: the same job, 2004 → today

```java
// 2004: find even numbers (display only)
List<Integer> evens = new ArrayList<Integer>();
for (Integer n : numbers) {
    if (n % 2 == 0) evens.add(n);
}

// today: streams (covered in the Streams module)
List<Integer> evens = numbers.stream().filter(n -> n % 2 == 0).toList();
```

Notice the 2004 code is *honest and readable* — streams didn't make it wrong, just shorter. Learn both voices; legacy code will speak the first forever.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Autoboxing inside tight loops (`Long sum; sum += i`) | Creates a new object per iteration — measurable GC pressure | Use primitive `long` accumulators |
| `==` on boxed wrappers (`new Integer(200) == new Integer(200)`) | False outside the cached -128..127 range | `.equals()` for wrappers; `==` only for enums |
| Raw `List` "just to stop the warnings" | Throws away all the safety Java 5 bought | Keep generics; fix the signature |
| `switch` over enum missing a case | Only fails when the new constant first hits it | Enable `-Xlint:fallthrough`; prefer exhaustive switches |

## Quick check

1. Rewrite this safely with generics: `List l = new ArrayList(); l.add("x"); String s = (String) l.get(0);`
2. Why is `==` correct for enums but wrong for `Integer`?
3. A method must accept 0..n prices and sum them — which Java 5 feature, and what's the signature?

<!-- answers: List<String> l = new ArrayList<>(); l.add("x"); String s = l.get(0); — cast gone; enums are singletons with identity guaranteed, Integer caches only -128..127; varargs — static double total(double... prices) -->

## References

- [Oracle — official JDK documentation](https://docs.oracle.com/javase/1.5.0/docs/guide/language/)
- [dev.java — the official OpenJDK site](https://dev.java/learn/generics/)
- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/lang/enhancements.html)
