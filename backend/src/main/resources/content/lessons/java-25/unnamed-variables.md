---
title: Unnamed Variables — When You Don't Care About the Name
summary: What unnamed variables are, the _ wildcard, when to use them, and how they improve code clarity by signaling intentional non-use.
order: 3
minutes: 12
topics: [unnamed-variables, wildcard, pattern-matching, jep456, java25]
docs:
  - https://openjdk.org/jeps/456
---

## The Concept, From Zero

Sometimes you need a variable syntactically but never use it. Before Java 22, you had to give it a meaningless name:


**What this code does — step by step:**

1. OLD: variable 'e' is never used but required
2. `} catch (Exception e) {` — 'e' is never used
3. OLD: loop variable unused
4. 'i' is never used
5. OLD: lambda parameter unused
6. Actually 'item' IS used — but what about:
7. `list.stream().map(String::length).toList();` — here we don't create unused vars

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        try {
            riskyOperation();
        } catch (Exception e) {
            logError();
        }

        for (int i = 0; i < 10; i++) {
            System.out.println("Processing...");
        }

        list.forEach(item -> System.out.println(item));
        list.stream().map(String::length).toList();
    }
}
```

Java 22 introduced **unnamed variables** using `_` (underscore):


**What this code does — step by step:**

1. JAVA 22+: Clearly signals "I don't need this"
2. `} catch (Exception _) {` — underscore = intentionally unused
3. Unnamed loop variable
4. Unnamed pattern variable
5. Unnamed lambda parameter
6. `list.forEach(_ -> {});` — intentionally ignoring the element

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        try {
            riskyOperation();
        } catch (Exception _) {
            logError();
        }

        for (int _ = 0; _ < 10; _++) {
            System.out.println("Processing...");
        }

        if (obj instanceof String _) {
            System.out.println("It's a string");
        }

        list.forEach(_ -> {});
    }
}
```

---

## When to Use `_`


**What this code does — step by step:**

1. Good: Catch block where you only care about the exception type
2. Good: Pattern matching where you only check type
3. Good: Records you're destructuring but don't need all fields
4. Only need status
5. Good: Nested try-with-resources
6. 'a.txt' is opened for side effects, we don't use the stream directly

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        try {
            parse(input);
        } catch (NumberFormatException _) {
            return defaultValue;
        }

        if (obj instanceof Integer _) {
            System.out.println("It's an integer");
        }

        record Result(String status, String data, int code) {}
        if (result instanceof Result(String status, _, _)) {
            System.out.println("Status: " + status);
        }

        try (var _ = new FileInputStream("a.txt");
             var reader = new BufferedReader(new InputStreamReader(new FileInputStream("b.txt")))) {
            String line = reader.readLine();
        }
    }
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Exception handling — catch without using the exception
2. We don't need the exception details
3. Line 2: Pattern matching — check type but don't use the variable
4. Line 3: Record destructuring — ignore fields you don't need
5. Line 4: Loop variables — when count doesn't matter
6. Line 5: Test safe parsing
7. `System.out.println(safeParseInt("42", 0));` — 42
8. `System.out.println(safeParseInt("abc", -1));` — -1
9. Line 6: Test type checking
10. `System.out.println(getType("hello"));` — "string"
11. `System.out.println(getType(42));` — "integer"
12. `System.out.println(getType(List.of(1, 2)));` — "list"
13. Line 7: Test record destructuring
14. `System.out.println(getDisplayName(user));` — "Alice (30)"
15. Line 8: Test repeat
16. Hello! Hello! Hello!
17. Line 9: Unnamed in streams
18. `.filter(_ -> true)` — keep all (unnamed parameter)
19. `.map(name -> name.toUpperCase())` — named when used

The same code, clean:

```java
import java.util.*;
import java.util.stream.*;

public class UnnamedVariablesDemo {
    static int safeParseInt(String input, int defaultValue) {
        try {
            return Integer.parseInt(input);
        } catch (NumberFormatException _) {
            return defaultValue;
        }
    }

    static String getType(Object obj) {
        return switch (obj) {
            case String _    -> "string";
            case Integer _   -> "integer";
            case Double _    -> "double";
            case List<?> _   -> "list";
            case null        -> "null";
            default          -> "unknown";
        };
    }

    record User(String name, String email, String password, int age) {}

    static String getDisplayName(Object obj) {
        if (obj instanceof User(String name, _, _, int age)) {
            return name + " (" + age + ")";
        }
        return "Unknown";
    }

    static void repeat(int times, Runnable action) {
        for (int _ = 0; _ < times; _++) {
            action.run();
        }
    }

    public static void main(String[] args) {
        System.out.println(safeParseInt("42", 0));
        System.out.println(safeParseInt("abc", -1));

        System.out.println(getType("hello"));
        System.out.println(getType(42));
        System.out.println(getType(List.of(1, 2)));

        var user = new User("Alice", "alice@mail.com", "secret", 30);
        System.out.println(getDisplayName(user));

        repeat(3, () -> System.out.println("Hello!"));

        List<String> names = List.of("Alice", "Bob", "Charlie");
        names.stream()
            .filter(_ -> true)
            .map(name -> name.toUpperCase())
            .forEach(name -> System.out.println(name));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Error handling without details

public Optional<User> findUser(String id) {
    try {
        return Optional.of(userRepository.findById(id));
    } catch (UserNotFoundException _) {
        return Optional.empty();  // don't need the exception
    }
}

### Scenario 2: Try-with-resources for side effects

```java
public void copyFile(String from, String to) throws IOException {
    try (var _ = new FileInputStream(from);    // opened for side effect
         var out = new FileOutputStream(to)) {
        in.transferTo(out);  // 'in' is the from stream
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `_` for variables you DO use | Compilation error | Give it a proper name |
| Overusing `_` everywhere | Reduces readability | Only use when truly unused |
| Multiple `_` in same scope | Confusing | Use `_` only for clearly independent variables |
| Using `_` in old-style for loops | May not work in all contexts | Test in your JDK version |

## References

- [dev.java — the official OpenJDK site](https://dev.java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/25/docs/api/)
