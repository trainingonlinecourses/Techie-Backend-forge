---
title: Java Functional Programming — Lambda Expressions, Method References, and Functional Interfaces
summary: What functional programming means in Java, writing lambda expressions step by step, built-in functional interfaces (Predicate, Function, Consumer, Supplier), method references, composition of functions, and how Spring uses functional patterns with line-by-line walkthroughs.
order: 34
minutes: 30
topics: [lambda, functional-interface, predicate, function, consumer, supplier, method-reference, composition]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/function/package-summary.html
---

# Java Functional Programming — Lambda Expressions, Method References, and Functional Interfaces

## What is Functional Programming?

Functional programming is a style where you pass **functions as arguments** to other functions, just like you pass variables. Instead of writing a loop that processes each element, you pass a function that describes WHAT to do with each element.

**Beginner mental model:** Think of it like giving instructions to a robot. Instead of saying "pick up each box, check if it's red, and put it on the left shelf" (imperative/loop), you say "here's a rule for what counts as red, and here's what to do with red boxes" (functional). The robot figures out the loop itself.

## Lambda Expressations — inline functions

A **lambda** is a shorthand way to write a function without creating a whole class. It's like an anonymous (unnamed) method.

### The old way (before Java 8)

// OLD WAY: create a whole class just to sort strings by length
List<String> names = List.of("Charlie", "Alice", "Bob");

// Anonymous class — verbose, lots of boilerplate
Collections.sort(names, new Comparator<String>() {
    @Override
    public int compare(String a, String b) {         // method body
        return Integer.compare(a.length(), b.length());
    }
});

### The lambda way


**What this code does — step by step:**

1. LAMBDA: same thing in one line
2. ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^. This is the lambda — equivalent to the entire anonymous class above
3. Breakdown of the lambda syntax: (a, b) -> Integer.compare(a.length(), b.length()). ^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^. Params body (expression or block). . A, b are the parameters (inferred from context — Java knows they're Strings) -> separates parameters from body. The body is a single expression — Java evaluates it and returns the result

The same code, clean:

```java
names.sort((a, b) -> Integer.compare(a.length(), b.length()));
```

### Lambda syntax variations


**What this code does — step by step:**

1. Full form (with types)
2. Type inference (Java knows the types from context)
3. Single parameter — parentheses optional
4. Multiple statements — use curly braces and explicit return
5. No parameters — empty parentheses
6. Returning an object — parentheses around the expression
7. `name -> new User(name)` — equivalent to: (name) -> { return new User(name); }

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        (String a, String b) -> Integer.compare(a.length(), b.length())

        (a, b) -> Integer.compare(a.length(), b.length())

        name -> name.length()

        (a, b) -> {
            int lenA = a.length();
            int lenB = b.length();
            return Integer.compare(lenA, lenB);
        }

        () -> System.out.println("Hello")

        name -> new User(name)
    }
}
```

## Built-in Functional Interfaces — the 4 you need to know

Java provides these in `java.util.function`:

### Predicate<T> — tests a condition (returns boolean)


**What this code does — step by step:**

1. Predicate<T> takes T, returns boolean. Like a yes/no question: "Is this element valid?"
2. `System.out.println(isLong.test("Alice"));` — false (5 chars, not > 5)
3. `System.out.println(isLong.test("Charlie"));` — true (7 chars > 5)
4. Combining predicates with AND, OR, NOT
5. AND — both must be true
6. `System.out.println(isLongAndStartsWithA.test("Alice"));` — true
7. OR — at least one must be true
8. NOT — reverses the result

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Predicate<String> isLong = name -> name.length() > 5;
        System.out.println(isLong.test("Alice"));
        System.out.println(isLong.test("Charlie"));

        Predicate<String> startsWithA = name -> name.startsWith("A");
        Predicate<String> hasMoreThan3Chars = name -> name.length() > 3;

        Predicate<String> isLongAndStartsWithA = startsWithA.and(hasMoreThan3Chars);
        System.out.println(isLongAndStartsWithA.test("Alice"));

        Predicate<String> startsWithAOrLong = startsWithA.or(hasMoreThan3Chars);

        Predicate<String> notStartsWithA = startsWithA.negate();
    }
}
```

### Function<T, R> — transforms T into R


**What this code does — step by step:**

1. Function<T, R> takes T, returns R. Like a machine: put in one thing, get out another
2. `System.out.println(nameToLength.apply("Alice"));` — 5
3. Composing functions (chaining transformations)
4. `System.out.println(upperLength.apply("alice"));` — 5 ("ALICE" → 5)
5. orThen vs compose (order matters!). AndThen: this first, then the other. Compose: the other first, then this
6. `System.out.println(doubleIt.andThen(addTen).apply(5));` — (5*2)+10 = 20
7. `System.out.println(doubleIt.compose(addTen).apply(5));` — (5+10)*2 = 30

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Function<String, Integer> nameToLength = name -> name.length();
        System.out.println(nameToLength.apply("Alice"));

        Function<String, String> toUpperCase = name -> name.toUpperCase();
        Function<String, Integer> toLength = name -> name.length();
        Function<String, Integer> upperLength = toUpperCase.andThen(toLength);
        System.out.println(upperLength.apply("alice"));

        Function<Integer, Integer> doubleIt = n -> n * 2;
        Function<Integer, Integer> addTen = n -> n + 10;
        System.out.println(doubleIt.andThen(addTen).apply(5));
        System.out.println(doubleIt.compose(addTen).apply(5));
    }
}
```

### Consumer<T> — performs an action (returns nothing)


**What this code does — step by step:**

1. Consumer<T> takes T, returns void. Like a black hole: put something in, no return value
2. `printer.accept("Alice");` — prints "Hello, Alice"
3. Chaining consumers
4. andThen: run this, then the other
5. `both.accept("Alice");` — prints "ALICE" then "alice"

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Consumer<String> printer = name -> System.out.println("Hello, " + name);
        printer.accept("Alice");

        Consumer<String> shout = name -> System.out.println(name.toUpperCase());
        Consumer<String> whisper = name -> System.out.println(name.toLowerCase());

        Consumer<String> both = shout.andThen(whisper);
        both.accept("Alice");
    }
}
```

### Supplier<T> — provides a value (takes nothing)

// Supplier<T> takes nothing, returns T
// Like a factory: call it to get a new instance
Supplier<List<String>> listFactory = () -> new ArrayList<>();
List<String> newList = listFactory.get();  // creates a new empty ArrayList

Supplier<LocalDateTime> nowFactory = LocalDateTime::now;
LocalDateTime timestamp = nowFactory.get();  // gets current time

## Method References — shorthand for lambdas

When a lambda just calls an existing method, you can use a method reference (shorter, clearer):


**What this code does — step by step:**

1. LAMBDA version
2. METHOD REFERENCE version — same thing, shorter
3. ^^^^^^^^^^^^^^^^^^^. ClassName::methodName
4. Three types of method references:
5. 1. Static method reference: ClassName::staticMethod
6. `Function<String, Integer> parseInt = Integer::parseInt;` — same as s -> Integer.parseInt(s)
7. `Supplier<LocalDateTime> now = LocalDateTime::now;` — same as () -> LocalDateTime.now()
8. 2. Instance method of a particular object
9. `Consumer<String> printer = System.out::println;` — same as s -> System.out.println(s)
10. `Supplier<String> upper = greeting::toUpperCase;` — same as () -> greeting.toUpperCase()
11. 3. Instance method of an arbitrary object (first param is the receiver)
12. `Function<String, String> toUpper = String::toUpperCase;` — same as s -> s.toUpperCase()
13. `Function<String, Integer> len = String::length;` — same as s -> s.length()

The same code, clean:

```java
Function<String, Integer> lengthFunc = name -> name.length();

Function<String, Integer> lengthFunc = String::length;


Function<String, Integer> parseInt = Integer::parseInt;
Supplier<LocalDateTime> now = LocalDateTime::now;

String greeting = "Hello, World!";
Consumer<String> printer = System.out::println;
Supplier<String> upper = greeting::toUpperCase;

Function<String, String> toUpper = String::toUpperCase;
Function<String, Integer> len = String::length;
```

## Function Composition — combining functions


**What this code does — step by step:**

1. You can chain functions together like a pipeline
2. Chain: trim → lowercase → remove spaces
3. `System.out.println(normalize.apply("  Hello World  "));` — "helloworld"
4. In practice — building a data processing pipeline
5. Usage
6. `String domain = getUserDomain.apply(user);` — "example.com"

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Function<String, String> trim = String::trim;
        Function<String, String> lower = String::toLowerCase;
        Function<String, String> removeSpaces = s -> s.replace(" ", "");

        Function<String, String> normalize = trim.andThen(lower).andThen(removeSpaces);
        System.out.println(normalize.apply("  Hello World  "));

        Function<User, String> extractEmail = User::getEmail;
        Function<String, String> normalizeEmail = email -> email.toLowerCase().trim();
        Function<String, String> extractDomain = email -> email.substring(email.indexOf("@") + 1);

        Function<User, String> getUserDomain = extractEmail
            .andThen(normalizeEmail)
            .andThen(extractDomain);

        User user = new User("Alice", "Alice@Example.COM");
        String domain = getUserDomain.apply(user);
    }
}
```

## How we use it in organizations

### Scenario 1: Strategy pattern with lambdas


**What this code does — step by step:**

1. Without lambdas — need a class for each strategy
2. WITH lambdas — no class needed
3. `"STANDARD", price -> price,` — no discount
4. `"MEMBER",   price -> price.multiply(0.9),` — 10% off
5. `"VIP",      price -> price.multiply(0.8),` — 20% off
6. `"FLASH",    price -> price.multiply(0.5)` — 50% off
7. `price -> price` — default: no discount

The same code, clean:

```java
public interface DiscountStrategy {
    Money apply(Money price);
}

public class TenPercentDiscount implements DiscountStrategy {
    public Money apply(Money price) {
        return price.multiply(0.9);
    }
}

public class PricingService {
    private final Map<String, Function<Money, Money>> discountStrategies = Map.of(
        "STANDARD", price -> price,
        "MEMBER",   price -> price.multiply(0.9),
        "VIP",      price -> price.multiply(0.8),
        "FLASH",    price -> price.multiply(0.5)
    );

    public Money calculatePrice(Money basePrice, String customerTier) {
        Function<Money, Money> strategy = discountStrategies.getOrDefault(
            customerTier,
            price -> price
        );
        return strategy.apply(basePrice);
    }
}
```

### Scenario 2: Event handling with Consumer lambdas


**What this code does — step by step:**

1. Map of event type → list of handlers (Consumers)
2. Register a handler for an event type
3. Fire an event — all registered handlers run
4. Usage
5. Register handlers — each is a lambda (Consumer)
6. Fire event — both handlers run

The same code, clean:

```java
public class EventBus {
    private final Map<Class<?>, List<Consumer<?>>> handlers = new HashMap<>();

    public <T> void on(Class<T> eventType, Consumer<T> handler) {
        handlers.computeIfAbsent(eventType, k -> new ArrayList<>())
                .add(handler);
    }

    public <T> void fire(T event) {
        List<Consumer<?>> eventHandlers = handlers.get(event.getClass());
        if (eventHandlers != null) {
            for (Consumer<?> handler : eventHandlers) {
                @SuppressWarnings("unchecked")
                Consumer<T> typed = (Consumer<T>) handler;
                typed.accept(event);
            }
        }
    }
}

EventBus bus = new EventBus();

bus.on(UserCreated.class, event -> {
    emailService.sendWelcome(event.user().getEmail());
});

bus.on(UserCreated.class, event -> {
    auditLog.record("User created: " + event.user().getName());
});

bus.fire(new UserCreated(newUser));
```

### Scenario 3: Building a data validation framework

// A validator that chains multiple checks using Predicates
public class Validator<T> {
    private final List<Function<T, Optional<String>>> checks = new ArrayList<>();

    public Validator<T> check(String fieldName, Function<T, String> extractor, Predicate<String> condition, String errorMsg) {
        checks.add(entity -> {
            String value = extractor.apply(entity);
            if (value == null || !condition.test(value)) {
                return Optional.of(fieldName + ": " + errorMsg);
            }
            return Optional.empty();
        });
        return this;  // fluent API — chain calls
    }

    public List<String> validate(T entity) {
        return checks.stream()
            .map(check -> check.apply(entity))
            .filter(Optional::isPresent)
            .map(Optional::get)
            .toList();
    }
}

// Usage — readable, chainable validation
Validator<User> userValidator = new Validator<User>()
    .check("name", User::getName, name -> name != null && !name.isBlank(), "Name is required")
    .check("email", User::getEmail, email -> email != null && email.contains("@"), "Valid email required")
    .check("age", user -> String.valueOf(user.getAge()), age -> Integer.parseInt(age) >= 18, "Must be 18+");

List<String> errors = userValidator.validate(newUser);

## Functional vs Imperative — comparison

// IMPERATIVE: tell Java HOW to do it
List<String> result = new ArrayList<>();
for (String name : names) {
    if (name.length() > 3) {
        result.add(name.toUpperCase());
    }
}

// FUNCTIONAL: tell Java WHAT you want
List<String> result = names.stream()
    .filter(name -> name.length() > 3)
    .map(String::toUpperCase)
    .toList();

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Overly complex lambdas (multi-line logic) | Hard to read and test | Extract to a named method |
| Mutating captured variables in lambdas | Compilation error (must be effectively final) | Use arrays or AtomicInteger for mutable state |
| Using lambdas where a simple loop suffices | Unnecessary complexity | Use loops for simple iteration |
| Creating functional interfaces when one exists | Redundant code | Check java.util.function first |
| Chaining too many andThen calls | Unreadable pipeline | Break into named intermediate functions |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
