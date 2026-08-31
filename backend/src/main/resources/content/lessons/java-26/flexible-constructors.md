---
title: Flexible Constructors — Fields Before super()
summary: Java 26 allows statements before super() in constructors, enabling field initialization before the parent constructor runs and eliminating the need for static factory methods.
order: 4
minutes: 18
topics: [flexible-constructors, super-before, constructor-ordering, preview]
docs:
  - https://openjdk.org/jeps/482
---

## The Concept, From Zero

In Java, the very first statement in a constructor must be either `this()` or `super()`. This restriction means you can't validate or compute arguments before passing them to the parent constructor:

```java
class PositiveNumber {
    PositiveNumber(int value) {
        // Can't validate before super()!
        super(value < 0 ? 0 : value);  // Workaround
    }
}
```

Java 26 relaxes this restriction. You can now do calculations, validations, and even field assignments before calling `super()`.

## The Code

```java
public class Rectangle {
    private final int width;
    private final int height;

    Rectangle(int w, int h) {
        this.width = w;
        this.height = h;
    }
}

// Before Java 26: couldn't validate before super()
class SafeRectangle extends Rectangle {
    SafeRectangle(int w, int h) {
        // Workaround: use static method
        super(Math.max(0, w), Math.max(0, h));
    }
}

// After Java 26: validate before super()
class BetterRectangle extends Rectangle {
    BetterRectangle(int w, int h) {
        int safeW = Math.max(0, w);  // ✅ Before super()
        int safeH = Math.max(0, h);  // ✅ Before super()
        super(safeW, safeH);
    }
}

// Even more useful: compute derived values
class UserProfile extends BaseUser {
    UserProfile(String name, String email) {
        super(name.toLowerCase().trim(), email.toLowerCase().trim());
        // Parent gets clean data
    }
}
```

## Key Takeaways

1. **Statements before super()** — validate, compute, or transform before passing to parent
2. **No more static factory workarounds** — cleaner constructor logic
3. **Same initialization order** — fields are still zeroed before any constructor runs
4. **Preview in Java 26** — may change based on feedback
5. **Only simple expressions** — you can't call instance methods before super()
