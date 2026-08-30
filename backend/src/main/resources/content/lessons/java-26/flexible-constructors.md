---
title: Flexible Constructor Bodies — Statements Before super()
summary: What flexible constructors are, why they exist, pre-super initialization, and how they simplify constructor chains.
order: 3
minutes: 15
topics: [flexible-constructors, super, constructor-chaining, jep482, java26]
docs:
  - https://openjdk.org/jeps/482
---

## The Concept, From Zero

Before Java 22, you could NOT put any statements before `this()` or `super()` in a constructor:

```java
// OLD: Cannot validate before calling super()
public class User {
    private final String name;

    public User(String rawName) {
        // String processed = rawName.strip();  // COMPILE ERROR!
        // if (processed.isEmpty()) throw ...;  // COMPILE ERROR!
        super();  // Must be first statement
        // Now it's too late to validate
        this.name = processed;
    }
}
```

This forced awkward workarounds like static factory methods or helper methods.

Java 22+ (finalized in Java 26) allows **statements before `super()` or `this()`**:

```java
// JAVA 22+: Validate BEFORE calling super()
public class User {
    private final String name;

    public User(String rawName) {
        String processed = rawName.strip();     // ✅ OK before super()
        if (processed.isEmpty()) {
            throw new IllegalArgumentException("Name cannot be empty");
        }
        super();                                 // Now call super with clean data
        this.name = processed;
    }
}
```

---

## Key Rules

1. You CAN put statements before `super()` or `this()`
2. You CANNOT read `this` before `super()` completes (the object isn't fully initialized)
3. You CAN read method parameters and local variables
4. You CAN throw exceptions
5. You CAN do computation

```java
public class Employee {
    private final String name;
    private final String department;

    public Employee(String name, String dept) {
        // ✅ OK: local computation
        String cleanName = name.strip();
        String cleanDept = dept.toUpperCase();

        // ✅ OK: validation
        if (cleanName.isEmpty()) throw new IllegalArgumentException("Name required");
        if (cleanDept.isEmpty()) throw new IllegalArgumentException("Dept required");

        // ✅ OK: static method calls
        log.debug("Creating employee: {}", cleanName);

        super();  // Now call parent constructor
        this.name = cleanName;
        this.department = cleanDept;
    }
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.logging.Logger;

public class FlexibleConstructorsDemo {
    private static final Logger log = Logger.getLogger("demo");

    // Line 1: Basic — validation before super()
    static class Person {
        private final String name;
        private final int age;

        Person(String name, int age) {
            // Line 2: Validate BEFORE calling super()
            String cleanName = name.strip();
            if (cleanName.isEmpty()) {
                throw new IllegalArgumentException("Name cannot be empty");
            }
            if (age < 0 || age > 150) {
                throw new IllegalArgumentException("Invalid age: " + age);
            }

            // Line 3: Now call super() with validated data
            super();  // calls Object()
            this.name = cleanName;
            this.age = age;
        }

        @Override
        public String toString() { return name + " (" + age + ")"; }
    }

    // Line 4: Constructor chaining with validation
    static class Employee extends Person {
        private final String department;
        private final double salary;

        Employee(String name, int age, String dept, double salary) {
            // Line 5: Compute and validate before chaining
            String normalizedDept = dept.strip().toUpperCase();
            double adjustedSalary = Math.max(salary, 0);  // ensure non-negative

            // Line 6: Chain to another constructor
            this(name, age, normalizedDept, adjustedSalary);
        }

        Employee(String name, int age, String dept, double salary) {
            super(name, age);  // chains to Person constructor
            this.department = dept;
            this.salary = salary;
        }

        @Override
        public String toString() {
            return super.toString() + " - " + department + " $" + salary;
        }
    }

    // Line 7: Practical — factory-like constructor
    static class Config {
        private final String host;
        private final int port;
        private final boolean secure;

        Config(String url) {
            // Line 8: Parse URL before calling super()
            java.net.URI uri;
            try {
                uri = java.net.URI.create(url);
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid URL: " + url, e);
            }

            String host = uri.getHost();
            int port = uri.getPort();
            boolean secure = "https".equals(uri.getScheme());

            if (host == null || host.isEmpty()) {
                throw new IllegalArgumentException("Host required in URL");
            }
            if (port == -1) port = secure ? 443 : 80;

            super();  // Object constructor
            this.host = host;
            this.port = port;
            this.secure = secure;
        }

        @Override
        public String toString() {
            return (secure ? "https" : "http") + "://" + host + ":" + port;
        }
    }

    public static void main(String[] args) {
        // Line 9: Test basic validation
        try {
            Person p = new Person("Alice", 30);
            System.out.println("Created: " + p);
        } catch (Exception e) {
            System.out.println("Error: " + e.getMessage());
        }

        // Line 10: Test validation failure
        try {
            Person p2 = new Person("  ", 25);  // empty after strip
        } catch (IllegalArgumentException e) {
            System.out.println("Validation caught: " + e.getMessage());
        }

        // Line 11: Test employee
        Employee emp = new Employee("Bob", 35, "engineering", 95000);
        System.out.println("Employee: " + emp);

        // Line 12: Test config parsing
        Config config = new Config("https://api.example.com:8080");
        System.out.println("Config: " + config);

        try {
            Config bad = new Config("not-a-url");
        } catch (IllegalArgumentException e) {
            System.out.println("Config error: " + e.getMessage());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Immutable value objects with validation

```java
public class Email {
    private final String address;

    public Email(String raw) {
        String normalized = raw.strip().toLowerCase();
        if (!normalized.matches("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")) {
            throw new IllegalArgumentException("Invalid email: " + raw);
        }
        super();
        this.address = normalized;
    }
}
```

### Scenario 2: Builder-like constructors

```java
public class Request {
    private final String method;
    private final String path;
    private final Map<String, String> headers;

    public Request(String method, String url) {
        java.net.URI uri = java.net.URI.create(url);
        String path = uri.getRawPath();
        if (path == null) path = "/";

        super();
        this.method = method.toUpperCase();
        this.path = path;
        this.headers = new HashMap<>();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Accessing `this` before `super()` | Compilation error | Only access params/locals before super() |
| Forgetting super() call | Compilation error | Always call super() or this() |
| Doing too much before super() | Hard to debug | Keep pre-super logic minimal |
| Not validating before super() | Wasted object creation | Validate early, construct late |
| Using this() and super() together | Compilation error | Choose one constructor chain |
