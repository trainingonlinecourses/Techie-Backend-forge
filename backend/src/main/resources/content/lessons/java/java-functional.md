---
title: Java Functional Programming — Lambda Expressions, Method References, and Functional Interfaces
summary: What functional programming means in Java, writing lambda expressions step by step, built-in functional interfaces (Predicate, Function, Consumer, Supplier), method references, composition of functions, and how Spring uses functional patterns with line-by-line walkthroughs.
order: 8
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

```java
// OLD WAY: create a whole class just to sort strings by length
List<String> names = List.of("Charlie", "Alice", "Bob");

// Anonymous class — verbose, lots of boilerplate
Collections.sort(names, new Comparator<String>() {
    @Override
    public int compare(String a, String b) {         // method body
        return Integer.compare(a.length(), b.length());
    }
});
```

### The lambda way

```java
// LAMBDA: same thing in one line
names.sort((a, b) -> Integer.compare(a.length(), b.length()));
//            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//            This is the lambda — equivalent to the entire anonymous class above

// Breakdown of the lambda syntax:
// (a, b) -> Integer.compare(a.length(), b.length())
//  ^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//  params          body (expression or block)
//
// a, b are the parameters (inferred from context — Java knows they're Strings)
// -> separates parameters from body
// The body is a single expression — Java evaluates it and returns the result
```

### Lambda syntax variations

```java
// Full form (with types)
(String a, String b) -> Integer.compare(a.length(), b.length())

// Type inference (Java knows the types from context)
(a, b) -> Integer.compare(a.length(), b.length())

// Single parameter — parentheses optional
name -> name.length()

// Multiple statements — use curly braces and explicit return
(a, b) -> {
    int lenA = a.length();
    int lenB = b.length();
    return Integer.compare(lenA, lenB);
}

// No parameters — empty parentheses
() -> System.out.println("Hello")

// Returning an object — parentheses around the expression
name -> new User(name)    // equivalent to: (name) -> { return new User(name); }
```

## Built-in Functional Interfaces — the 4 you need to know

Java provides these in `java.util.function`:

### Predicate<T> — tests a condition (returns boolean)

```java
// Predicate<T> takes T, returns boolean
// Like a yes/no question: "Is this element valid?"
Predicate<String> isLong = name -> name.length() > 5;
System.out.println(isLong.test("Alice"));   // false (5 chars, not > 5)
System.out.println(isLong.test("Charlie")); // true (7 chars > 5)

// Combining predicates with AND, OR, NOT
Predicate<String> startsWithA = name -> name.startsWith("A");
Predicate<String> hasMoreThan3Chars = name -> name.length() > 3;

// AND — both must be true
Predicate<String> isLongAndStartsWithA = startsWithA.and(hasMoreThan3Chars);
System.out.println(isLongAndStartsWithA.test("Alice"));  // true

// OR — at least one must be true
Predicate<String> startsWithAOrLong = startsWithA.or(hasMoreThan3Chars);

// NOT — reverses the result
Predicate<String> notStartsWithA = startsWithA.negate();
```

### Function<T, R> — transforms T into R

```java
// Function<T, R> takes T, returns R
// Like a machine: put in one thing, get out another
Function<String, Integer> nameToLength = name -> name.length();
System.out.println(nameToLength.apply("Alice"));  // 5

// Composing functions (chaining transformations)
Function<String, String> toUpperCase = name -> name.toUpperCase();
Function<String, Integer> toLength = name -> name.length();
Function<String, Integer> upperLength = toUpperCase.andThen(toLength);
System.out.println(upperLength.apply("alice"));  // 5 ("ALICE" → 5)

// orThen vs compose (order matters!)
// andThen: this first, then the other
// compose: the other first, then this
Function<Integer, Integer> doubleIt = n -> n * 2;
Function<Integer, Integer> addTen = n -> n + 10;
System.out.println(doubleIt.andThen(addTen).apply(5));   // (5*2)+10 = 20
System.out.println(doubleIt.compose(addTen).apply(5));   // (5+10)*2 = 30
```

### Consumer<T> — performs an action (returns nothing)

```java
// Consumer<T> takes T, returns void
// Like a black hole: put something in, no return value
Consumer<String> printer = name -> System.out.println("Hello, " + name);
printer.accept("Alice");  // prints "Hello, Alice"

// Chaining consumers
Consumer<String> shout = name -> System.out.println(name.toUpperCase());
Consumer<String> whisper = name -> System.out.println(name.toLowerCase());

// andThen: run this, then the other
Consumer<String> both = shout.andThen(whisper);
both.accept("Alice");  // prints "ALICE" then "alice"
```

### Supplier<T> — provides a value (takes nothing)

```java
// Supplier<T> takes nothing, returns T
// Like a factory: call it to get a new instance
Supplier<List<String>> listFactory = () -> new ArrayList<>();
List<String> newList = listFactory.get();  // creates a new empty ArrayList

Supplier<LocalDateTime> nowFactory = LocalDateTime::now;
LocalDateTime timestamp = nowFactory.get();  // gets current time
```

## Method References — shorthand for lambdas

When a lambda just calls an existing method, you can use a method reference (shorter, clearer):

```java
// LAMBDA version
Function<String, Integer> lengthFunc = name -> name.length();

// METHOD REFERENCE version — same thing, shorter
Function<String, Integer> lengthFunc = String::length;
//               ^^^^^^^^^^^^^^^^^^^
//               ClassName::methodName

// Three types of method references:

// 1. Static method reference: ClassName::staticMethod
Function<String, Integer> parseInt = Integer::parseInt;      // same as s -> Integer.parseInt(s)
Supplier<LocalDateTime> now = LocalDateTime::now;            // same as () -> LocalDateTime.now()

// 2. Instance method of a particular object
String greeting = "Hello, World!";
Consumer<String> printer = System.out::println;              // same as s -> System.out.println(s)
Supplier<String> upper = greeting::toUpperCase;               // same as () -> greeting.toUpperCase()

// 3. Instance method of an arbitrary object (first param is the receiver)
Function<String, String> toUpper = String::toUpperCase;      // same as s -> s.toUpperCase()
Function<String, Integer> len = String::length;               // same as s -> s.length()
```

## Function Composition — combining functions

```java
// You can chain functions together like a pipeline
Function<String, String> trim = String::trim;
Function<String, String> lower = String::toLowerCase;
Function<String, String> removeSpaces = s -> s.replace(" ", "");

// Chain: trim → lowercase → remove spaces
Function<String, String> normalize = trim.andThen(lower).andThen(removeSpaces);
System.out.println(normalize.apply("  Hello World  "));  // "helloworld"

// In practice — building a data processing pipeline
Function<User, String> extractEmail = User::getEmail;
Function<String, String> normalizeEmail = email -> email.toLowerCase().trim();
Function<String, String> extractDomain = email -> email.substring(email.indexOf("@") + 1);

Function<User, String> getUserDomain = extractEmail
    .andThen(normalizeEmail)
    .andThen(extractDomain);

// Usage
User user = new User("Alice", "Alice@Example.COM");
String domain = getUserDomain.apply(user);  // "example.com"
```

## How we use it in organizations

### Scenario 1: Strategy pattern with lambdas

```java
// Without lambdas — need a class for each strategy
public interface DiscountStrategy {
    Money apply(Money price);
}

public class TenPercentDiscount implements DiscountStrategy {
    public Money apply(Money price) {
        return price.multiply(0.9);
    }
}

// WITH lambdas — no class needed
public class PricingService {
    private final Map<String, Function<Money, Money>> discountStrategies = Map.of(
        "STANDARD", price -> price,                                          // no discount
        "MEMBER",   price -> price.multiply(0.9),                            // 10% off
        "VIP",      price -> price.multiply(0.8),                            // 20% off
        "FLASH",    price -> price.multiply(0.5)                             // 50% off
    );

    public Money calculatePrice(Money basePrice, String customerTier) {
        Function<Money, Money> strategy = discountStrategies.getOrDefault(
            customerTier,
            price -> price  // default: no discount
        );
        return strategy.apply(basePrice);
    }
}
```

### Scenario 2: Event handling with Consumer lambdas

```java
public class EventBus {
    // Map of event type → list of handlers (Consumers)
    private final Map<Class<?>, List<Consumer<?>>> handlers = new HashMap<>();

    // Register a handler for an event type
    public <T> void on(Class<T> eventType, Consumer<T> handler) {
        handlers.computeIfAbsent(eventType, k -> new ArrayList<>())
                .add(handler);
    }

    // Fire an event — all registered handlers run
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

// Usage
EventBus bus = new EventBus();

// Register handlers — each is a lambda (Consumer)
bus.on(UserCreated.class, event -> {
    emailService.sendWelcome(event.user().getEmail());
});

bus.on(UserCreated.class, event -> {
    auditLog.record("User created: " + event.user().getName());
});

// Fire event — both handlers run
bus.fire(new UserCreated(newUser));
```

### Scenario 3: Building a data validation framework

```java
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
```

## Functional vs Imperative — comparison

```java
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
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Overly complex lambdas (multi-line logic) | Hard to read and test | Extract to a named method |
| Mutating captured variables in lambdas | Compilation error (must be effectively final) | Use arrays or AtomicInteger for mutable state |
| Using lambdas where a simple loop suffices | Unnecessary complexity | Use loops for simple iteration |
| Creating functional interfaces when one exists | Redundant code | Check java.util.function first |
| Chaining too many andThen calls | Unreadable pipeline | Break into named intermediate functions |
