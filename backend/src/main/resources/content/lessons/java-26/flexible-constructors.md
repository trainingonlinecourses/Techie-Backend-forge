---
title: Flexible Constructors — Fields Before super()
summary: Java 26 allows statements before super() in constructors, enabling field initialization before the parent constructor runs and eliminating the need for static factory methods.
order: 1
minutes: 18
topics: [flexible-constructors, super-before, constructor-ordering, preview]
docs:
  - https://openjdk.org/jeps/482
---

## The Concept, From Zero

In Java, the very first statement in a constructor must be either `this()` or `super()`. This restriction means you can't validate or compute arguments before passing them to the parent constructor:

class PositiveNumber {
    PositiveNumber(int value) {
        // Can't validate before super()!
        super(value < 0 ? 0 : value);  // Workaround
    }
}

Java 26 relaxes this restriction. You can now do calculations, validations, and even field assignments before calling `super()`.

## The Code


**What this code does — step by step:**

1. Before Java 26: couldn't validate before super()
2. Workaround: use static method
3. After Java 26: validate before super()
4. `int safeW = Math.max(0, w);` — ✅ Before super()
5. `int safeH = Math.max(0, h);` — ✅ Before super()
6. Even more useful: compute derived values
7. Parent gets clean data

The same code, clean:

```java
public class Rectangle {
    private final int width;
    private final int height;

    Rectangle(int w, int h) {
        this.width = w;
        this.height = h;
    }
}

class SafeRectangle extends Rectangle {
    SafeRectangle(int w, int h) {
        super(Math.max(0, w), Math.max(0, h));
    }
}

class BetterRectangle extends Rectangle {
    BetterRectangle(int w, int h) {
        int safeW = Math.max(0, w);
        int safeH = Math.max(0, h);
        super(safeW, safeH);
    }
}

class UserProfile extends BaseUser {
    UserProfile(String name, String email) {
        super(name.toLowerCase().trim(), email.toLowerCase().trim());
    }
}
```

## Key Takeaways

1. **Statements before super()** — validate, compute, or transform before passing to parent
2. **No more static factory workarounds** — cleaner constructor logic
3. **Same initialization order** — fields are still zeroed before any constructor runs
4. **Preview in Java 26** — may change based on feedback
5. **Only simple expressions** — you can't call instance methods before super()

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/26/docs/api/)
