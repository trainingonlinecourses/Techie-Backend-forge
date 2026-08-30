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

```java
// OLD: variable 'e' is never used but required
try {
    riskyOperation();
} catch (Exception e) {       // 'e' is never used
    logError();
}

// OLD: loop variable unused
for (int i = 0; i < 10; i++) {
    System.out.println("Processing...");
    // 'i' is never used
}

// OLD: lambda parameter unused
list.forEach(item -> System.out.println(item));
// Actually 'item' IS used — but what about:
list.stream().map(String::length).toList();  // here we don't create unused vars
```

Java 22 introduced **unnamed variables** using `_` (underscore):

```java
// JAVA 22+: Clearly signals "I don't need this"
try {
    riskyOperation();
} catch (Exception _) {       // underscore = intentionally unused
    logError();
}

// Unnamed loop variable
for (int _ = 0; _ < 10; _++) {
    System.out.println("Processing...");
}

// Unnamed pattern variable
if (obj instanceof String _) {
    System.out.println("It's a string");
}

// Unnamed lambda parameter
list.forEach(_ -> {});  // intentionally ignoring the element
```

---

## When to Use `_`

```java
// Good: Catch block where you only care about the exception type
try {
    parse(input);
} catch (NumberFormatException _) {
    return defaultValue;
}

// Good: Pattern matching where you only check type
if (obj instanceof Integer _) {
    System.out.println("It's an integer");
}

// Good: Records you're destructuring but don't need all fields
record Result(String status, String data, int code) {}
if (result instanceof Result(String status, _, _)) {
    // Only need status
    System.out.println("Status: " + status);
}

// Good: Nested try-with-resources
try (var _ = new FileInputStream("a.txt");
     var reader = new BufferedReader(new InputStreamReader(new FileInputStream("b.txt")))) {
    // 'a.txt' is opened for side effects, we don't use the stream directly
    String line = reader.readLine();
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.stream.*;

public class UnnamedVariablesDemo {
    // Line 1: Exception handling — catch without using the exception
    static int safeParseInt(String input, int defaultValue) {
        try {
            return Integer.parseInt(input);
        } catch (NumberFormatException _) {
            // We don't need the exception details
            return defaultValue;
        }
    }

    // Line 2: Pattern matching — check type but don't use the variable
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

    // Line 3: Record destructuring — ignore fields you don't need
    record User(String name, String email, String password, int age) {}

    static String getDisplayName(Object obj) {
        if (obj instanceof User(String name, _, _, int age)) {
            return name + " (" + age + ")";
        }
        return "Unknown";
    }

    // Line 4: Loop variables — when count doesn't matter
    static void repeat(int times, Runnable action) {
        for (int _ = 0; _ < times; _++) {
            action.run();
        }
    }

    public static void main(String[] args) {
        // Line 5: Test safe parsing
        System.out.println(safeParseInt("42", 0));    // 42
        System.out.println(safeParseInt("abc", -1));   // -1

        // Line 6: Test type checking
        System.out.println(getType("hello"));          // "string"
        System.out.println(getType(42));               // "integer"
        System.out.println(getType(List.of(1, 2)));    // "list"

        // Line 7: Test record destructuring
        var user = new User("Alice", "alice@mail.com", "secret", 30);
        System.out.println(getDisplayName(user));      // "Alice (30)"

        // Line 8: Test repeat
        repeat(3, () -> System.out.println("Hello!"));
        // Hello!
        // Hello!
        // Hello!

        // Line 9: Unnamed in streams
        List<String> names = List.of("Alice", "Bob", "Charlie");
        names.stream()
            .filter(_ -> true)  // keep all (unnamed parameter)
            .map(name -> name.toUpperCase())  // named when used
            .forEach(name -> System.out.println(name));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Error handling without details

```java
public Optional<User> findUser(String id) {
    try {
        return Optional.of(userRepository.findById(id));
    } catch (UserNotFoundException _) {
        return Optional.empty();  // don't need the exception
    }
}
```

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
