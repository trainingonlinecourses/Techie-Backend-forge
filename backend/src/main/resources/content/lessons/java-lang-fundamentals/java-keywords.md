---
title: The 50 Java Keywords — What Each One Actually Does
summary: Java reserves 50 words that you cannot use as your own identifiers. This lesson explains every one of them, grouped by what they do — declaring things, controlling flow, defining classes and objects, handling errors, and a few special cases — with a short code snippet for each so the keyword makes sense in context.
order: 4
minutes: 24
topics: [keywords, language, syntax, identifiers, reserved-words, java-lang]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-3.html#jls-3.9
---

## The Concept, From Zero

Java has exactly 50 words that the language reserves for itself. You are not allowed to name a class, method, variable, or package with any of them. If you try, the compiler stops you immediately with an error like `<identifier> expected` or `not a statement`.

These reserved words are not just an arbitrary list. They are the vocabulary that Java uses to express the core ideas of the language: declaring a class or method, creating a variable, branching and looping, handling exceptions, and a few special cases.

It helps to split the 50 keywords into groups by what they do. The groups are:

1. **Declaration keywords** — used to introduce new structures: classes, methods, variables, constants, and interfaces.
2. **Control-flow keywords** — used to branch, loop, and decide what happens next.
3. **Class and object keywords** — used to define and relate classes, objects, and types.
4. **Error-handling keywords** — used to signal and handle exceptions.
5. **Special and transitional keywords** — a small set with unique jobs, plus two older keywords that still exist but are rarely touched.

One important distinction: a **keyword** is reserved and cannot be used as an identifier. A **literal**, on the other hand, is a value written in the source — `true`, `false`, and `null` look like keywords but they are actually literals. You also cannot use them as identifiers, but they belong to a different category. The 50 keywords do not include `true`, `false`, or `null`.

### Group 1 — Declaration Keywords

These keywords introduce something new into the program.

**`abstract`** — Marks a class or method as incomplete. An abstract class cannot be instantiated directly (you cannot write `new AbstractClass()`), and an abstract method has a signature but no body; any concrete subclass must provide the body. Use it when a concept is shared but not fully defined.

```java
// An abstract class: shared behaviour, but not meant to be instantiated on its own
public abstract class Shape {
    protected String colour;

    public Shape(String colour) {
        this.colour = colour;
    }

    // Every concrete shape must define its own area calculation
    public abstract double area();
}

// A concrete subclass fills in the abstract method
public class Circle extends Shape {
    private double radius;

    public Circle(String colour, double radius) {
        super(colour);
        this.radius = radius;
    }

    @Override
    public double area() {
        return Math.PI * radius * radius;
    }
}
```

In this example, `Shape` is abstract because there is no such thing as a generic "shape" with a calculable area — you need a specific kind. `Circle` extends `Shape` and supplies `area()`.

**`assert`** — Used to write assertions, which are checks the programmer believes should always be true. If an assertion fails at runtime, the JVM throws an `AssertionError`. Assertions are a debugging aid; they are disabled by default at runtime and are not a substitute for real validation of user input.

```java
// An assertion says "I believe this condition is always true here"
int divide(int numerator, int denominator) {
    assert denominator != 0 : "denominator must not be zero";
    return numerator / denominator;
}
```

The second part after the colon is an optional message attached to the error. Because assertions are off by default, they do not slow down production code — the JVM simply skips them unless you start the JVM with `-ea` (enable assertions).

**`boolean`** — A primitive type that can hold only two values: `true` or `false`. It is the type of every condition in Java — every `if`, `while`, and `for` test, every comparison with `==`, `<`, `>`, and so on. You cannot cast an arbitrary number or object to `boolean`; the condition must really be a boolean expression.

```java
// boolean is the type of any condition
boolean isLoggedIn = false;
boolean hasPermission = user.getRoles().contains("ADMIN");
if (isLoggedIn && hasPermission) {
    System.out.println("access granted");
}
```

**`break`** — Exits the nearest enclosing loop or `switch` immediately. Execution continues with the statement after the loop or switch. It is useful when you have found what you were looking for and want to stop searching.

```java
// Stop searching as soon as we find the first matching user
User firstAdmin = null;
for (User u : users) {
    if (u.getRoles().contains("ADMIN")) {
        firstAdmin = u;
        break;   // exit the loop right now
    }
}
```

**`byte`** — A primitive integer type that holds whole numbers in the range -128 to 127. It is an 8-bit signed value. Use it when memory matters (large arrays of small numbers) or when you are working with binary data, not when you need a general-purpose counter.

```java
// byte holds small integers; useful for raw binary data
byte[] fileChunk = new byte[1024];
byte flag = 1;        // within range -128..127
byte large = 200;     // COMPILATION ERROR — 200 is outside the range
```

**`case`** — Marks one branch of a `switch` statement or switch expression. Each `case` gives a value to compare against the switch's selector, and execution jumps to the matching case. In a traditional switch, execution then "falls through" unless you write `break`; in a switch expression, each case produces a value and does not fall through.

```java
// Using case in a switch expression (Java 14+)
String weather = "rain";

String advice = switch (weather) {
    case "sun"   -> "wear sunscreen";
    case "rain"  -> "take an umbrella";
    case "snow"  -> "wear boots";
    default       -> "check the forecast";
};
```

**`catch`** — Introduces the block that handles an exception thrown by the `try` block. The `catch` block declares the type of exception it handles, and the JVM passes the caught exception into it as a variable so you can inspect or log it.

```java
// catch handles the exception that try might throw
try {
    int result = Integer.parseInt(userInput);
} catch (NumberFormatException e) {
    System.out.println("That was not a valid number: " + e.getMessage());
}
```

**`char`** — A primitive type that holds a single 16-bit Unicode character. It is the building block of Java strings. A `char` literal is written in single quotes: `'A'`, `'€'`, `'\n'`.

```java
char firstLetter = "Alice".charAt(0);   // 'A'
char newline = '\n';
```

**`class`** — Introduces a class declaration. A class is the blueprint for objects: it defines the fields (state) and methods (behaviour) that objects of that class will have. Every object in Java is an instance of some class.

```java
// class defines a blueprint for Account objects
public class Account {
    private final String owner;
    private double balance;

    public Account(String owner, double initialBalance) {
        this.owner = owner;
        this.balance = initialBalance;
    }

    public void deposit(double amount) {
        this.balance += amount;
    }
}
```

**`const`** — A reserved keyword that is **not currently used** in Java. It exists in the language only for historical reasons and potential future use. You cannot use it as an identifier, but you will never write a working Java program that uses `const`.

```java
// const is reserved but unused in Java today
// This is NOT valid Java — there is no const keyword in use:
// const int MAX = 100;   // compilation error: not a valid Java statement
```

Use `final` instead when you want a constant.

**`continue`** — In a loop, skips the rest of the current iteration and jumps to the loop's update and condition-check steps, effectively starting the next iteration. Use it when some iterations should be skipped without stopping the whole loop.

```java
// Skip even numbers; print only odd ones
for (int i = 0; i < 10; i++) {
    if (i % 2 == 0) {
        continue;   // skip to the next i
    }
    System.out.println(i);   // prints 1, 3, 5, 7, 9
}
```

**`default`** — Used in two places. In a `switch`, it is the branch taken when no `case` matches. In an interface, it introduces a method with a body, so that interface methods can provide a default implementation without forcing every implementing class to override them. Both uses are part of the same keyword but different contexts.

```java
// default in a switch (the fall-back branch)
switch (day) {
    case "Mon":
    case "Tue":
    case "Wed":
    case "Thu":
    case "Fri":
        System.out.println("weekday");
        break;
    default:
        System.out.println("weekend or unknown");
}

// default in an interface method
interface Payment {
    void pay(double amount);

    // A default method: implementing classes get this behaviour for free
    default void refund(double amount) {
        pay(-amount);
    }
}
```

**`do`** — Introduces a `do-while` loop, which executes its body **once before** testing the condition. This guarantees at least one iteration, which is useful when you need to ask for input at least once.

```java
// do-while: run the body first, then check the condition
Scanner sc = new Scanner(System.in);
int age;
do {
    System.out.print("Enter your age (1-120): ");
    age = sc.nextInt();
} while (age < 1 || age > 120);
```

**`double`** — A primitive floating-point type, a 64-bit double-precision number. It is the most common type for decimal calculations in Java, though it is not suitable for money where exact decimal arithmetic is required (use `BigDecimal` for that).

```java
double pi = 3.141592653589793;
double price = 19.99;
```

**`else`** — The fallback branch of an `if` statement. If the `if` condition is false, the `else` block runs. You can also chain `else if` to test several conditions in order.

```java
if (score >= 90) {
    System.out.println("A");
} else if (score >= 80) {
    System.out.println("B");
} else {
    System.out.println("C or below");
}
```

**`enum`** — Declares an enumerated type — a fixed set of constant values that are known at compile time. An enum is a full class, so it can have fields, methods, and constructors. It is far safer than using plain integers for a fixed set of options.

```java
// enum defines a closed set of values
enum Status {
    PENDING,
    APPROVED,
    REJECTED;

    public boolean isFinal() {
        return this == APPROVED || this == REJECTED;
    }
}

Status current = Status.APPROVED;
if (current.isFinal()) {
    System.out.println("decision locked");
}
```

**`extends`** — Indicates that a class is inheriting from a superclass, or that an interface is inheriting from another interface. The subclass or sub-interface gains the members of the parent and can add its own or override the parent's behaviour.

```java
// Circle extends Shape: it inherits the fields and methods of Shape
public class Circle extends Shape {
    private double radius;
    // Circle adds its own field and provides area()
}
```

**`final`** — Has three related meanings. On a variable, it means the value cannot be reassigned once set (for a primitive) or the reference cannot be changed (for an object — the object is still mutable). On a method, it means subclasses cannot override it. On a class, it means the class cannot be subclassed. It is the closest thing Java has to a "constant" declaration.

```java
// final on a variable: the reference cannot change
final String HOME = System.getProperty("user.home");
// HOME = "/tmp";   // compilation error — cannot reassign a final variable

// final on a method: subclasses cannot override it
public final boolean isAuthenticated() {
    return authenticated;
}

// final on a class: cannot be extended
public final class ImmutablePoint {
    private final int x, y;
    public ImmutablePoint(int x, int y) {
        this.x = x;
        this.y = y;
    }
}
```

**`finally`** — Introduces a block that runs after the `try` block completes, whether or not an exception was thrown. It is the right place for cleanup that must happen — closing a file, releasing a connection, freeing a resource. Even if the `try` returns early, the `finally` block still runs (except in extreme cases like `System.exit`).

```java
// finally always runs — ideal for cleanup
FileReader reader = null;
try {
    reader = new FileReader("config.txt");
    // read the file...
} catch (IOException e) {
    System.out.println("could not read config: " + e.getMessage());
} finally {
    if (reader != null) {
        try { reader.close(); } catch (IOException e) { /* log */ }
    }
}
```

**`float`** — A primitive floating-point type, a 32-bit single-precision number. It uses half the memory of `double` but has less precision. Use it only when you have many numbers and memory matters, or when matching an external format that uses 32-bit floats.

```java
float light = 0.5f;      // note the 'f' suffix for float literals
```

**`for`** — Introduces a `for` loop, which repeats a block a fixed number of times or over a collection. Java has three forms: the classic `for(init; condition; update)`, the enhanced `for-each` loop over collections and arrays, and (since Java 8) the `for` loop over a stream's elements. The enhanced loop is the one most readers will use most often.

```java
// Classic for: explicit counter
for (int i = 0; i < items.size(); i++) {
    System.out.println(items.get(i));
}

// Enhanced for: iterate directly
for (String item : items) {
    System.out.println(item);
}
```

**`goto`** — A reserved keyword that is **not currently used** in Java. Like `const`, it exists for historical reasons and possible future use, but Java has no `goto` statement. You cannot use it as an identifier.

```java
// goto is reserved but not used in Java
// This is NOT valid Java:
// goto end;   // compilation error
```

**`if`** — Tests a condition and runs one block if the condition is true. It is the most basic decision-making construct in Java. Every condition — every `if`, `else if`, `while`, `for`, and `switch` — must be a `boolean` expression.

```java
if (balance >= amount) {
    balance -= amount;
    System.out.println("withdrawal successful");
} else {
    System.out.println("insufficient funds");
}
```

**`implements`** — Indicates that a class is providing the methods required by one or more interfaces. An interface defines a contract — a list of methods a class promises to have — and `implements` is the keyword that makes a class keep that promise.

```java
interface PaymentProcessor {
    void process(double amount);
}

class StripeProcessor implements PaymentProcessor {
    @Override
    public void process(double amount) {
        // talk to the Stripe API...
    }
}
```

**`import`** — Tells the compiler which classes from other packages you want to use without writing the full package name each time. It does not copy anything into your code; it simply shortens the names you type. Importing a package does not automatically import its subpackages.

```java
// Import so you can write ArrayList instead of java.util.ArrayList
import java.util.ArrayList;
import java.util.HashMap;

List<String> names = new ArrayList<>();
Map<String, Integer> scores = new HashMap<>();
```

**`instanceof`** — Tests whether an object is an instance of a given type, or a subclass of that type. It returns `true` if the object is not null and is assignment-compatible with the type. Before Java 16, it was commonly used with a cast; now you can use pattern matching to do both in one step.

```java
// Classic: check then cast
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.toUpperCase());
}

// Pattern-matching (Java 16+): check and bind in one step
if (obj instanceof String s) {
    System.out.println(s.toUpperCase());
}
```

**`int`** — A primitive integer type, a 32-bit signed whole number. It is the default choice for counters, indices, and general-purpose whole numbers. Its range is roughly -2 billion to +2 billion.

```java
int count = 42;
int index = 0;
```

**`interface`** — Declares an interface — a contract that defines method signatures (and, since Java 8, `default` and `static` methods with bodies). A class that implements the interface promises to provide implementations for the interface's abstract methods. Interfaces let you write code against a type, not a concrete class.

```java
interface Repository<T> {
    T findById(int id);
    void save(T entity);
    void delete(int id);
}
```

**`long`** — A primitive integer type, a 64-bit signed whole number. It is used when the numbers exceed the `int` range — timestamps in milliseconds since the epoch are a classic use case.

```java
long timestamp = System.currentTimeMillis();   // milliseconds since 1970
long big = 10_000_000_000L;                   // underscore for readability; L suffix
```

**`native`** — Marks a method that is implemented not in Java but in platform-specific native code (usually C or C++). The body of a `native` method is replaced by a semicolon, and the actual implementation is provided by the JVM or a native library loaded with `System.loadLibrary`.

```java
// A native method: implemented in C, loaded from a native library
public class Sensor {
    static { System.loadLibrary("sensor"); }

    public native double readTemperature();
}
```

This is used for low-level system access, performance-critical code, or interfacing with existing native libraries, but most application code never uses it.

**`new`** — Creates a new object by calling a class's constructor. It allocates memory for the object, runs the constructor to initialise it, and returns a reference to the new object. Arrays are also created with `new`.

```java
// new creates a new object
Account acc = new Account("Alice", 100.0);

// new also creates arrays
int[] numbers = new int[10];
String[] names = new String[]{"A", "B", "C"};
```

**`non-sealed`** — (Java 17+) Used on a class or interface that is part of a sealed hierarchy but is allowed to be extended by anyone. A `sealed` class restricts which classes may extend it; a `non-sealed` class says "I am part of that hierarchy, but I choose to open my subclassing back up."

```java
// A sealed hierarchy
sealed class Shape permits Circle, Square { }

// Circle is final — no further subclassing
final class Circle extends Shape { }

// Square is non-sealed — others may extend it
non-sealed class Square extends Shape { }
class FancySquare extends Square { }   // allowed
```

**`null`** — A literal, not a keyword, but worth mentioning here. `null` represents the absence of a reference — it means "no object". A variable of any reference type can hold `null`. Using `null` incorrectly is one of the most common sources of `NullPointerException`.

```java
String name = null;   // name currently refers to nothing
if (name == null) {
    System.out.println("no name set");
}
```

**`package`** — Declares the package that a class belongs to. It must be the first non-comment line in a source file. The package name corresponds to the folder structure in which the source file lives, and it helps organise large codebases and avoid name collisions.

```java
// This file must live in the folder com/backendforge/academy/
package com.backendforge.academy;

public class AcademyApplication { }
```

**`private`** — The most restrictive access modifier. A `private` member (field, method, constructor) is visible only inside the class that declares it. It is the default choice for internal state — hide the details, expose only what is needed.

```java
public class User {
    private String password;   // only this class can see it

    public boolean verify(String candidate) {
        // this class's own methods may use password
        return BCrypt.checkpw(candidate, password);
    }
}
```

**`protected`** — An access level between `private` and `public`. A `protected` member is visible inside the same class, other classes in the same package, and subclasses — even subclasses in other packages. It is useful when you want to let subclasses hook into internal behaviour without exposing it to the whole world.

```java
public class AuditLog {
    protected void log(String message) {
        // subclasses and same-package classes can call this
    }
}
```

**`public`** — The least restrictive access modifier. A `public` class, method, or field is visible to any other class that can reach it. It is the API surface — what you intend other code to use.

```java
public class AccountService {
    public Account findAccount(String id) {
        // any class can call this
    }
}
```

### Group 2 — Control-Flow Keywords

**`return`** — Exits the current method and, optionally, gives back a value to the caller. If the method's return type is `void`, you can write `return;` to exit early. If the method returns a value, the `return` statement must provide an expression of that type.

```java
int max(int a, int b) {
    return a > b ? a : b;   // returns the larger value
}

void log(String msg) {
    if (msg == null) {
        return;              // exit early, no value
    }
    System.out.println(msg);
}
```

**`short`** — A primitive integer type, a 16-bit signed value. It is rarely used in modern Java because it saves little memory and the JVM often promotes it to `int` anyway, but it still exists and is useful when working with legacy formats or tightly packed data.

```java
short port = 8080;
// short max = 40000;   // compilation error — exceeds 16-bit range
```

**`static`** — Means "belongs to the class, not to any particular instance". A `static` field is shared by all instances of the class — there is only one copy. A `static` method can be called without creating an object, and it cannot access instance fields directly because there is no `this` in a static context. `static` is also used in `static` blocks that run once when the class is loaded.

```java
public class Config {
    // One copy shared by every instance
    public static final String APP_NAME = "BackendForge";

    // Called without creating a Config object
    public static int getMaxUsers() {
        return 1000;
    }
}
```

**`strictfp`** — A modifier that forces floating-point calculations to use strict IEEE 754 rules, so the results are the same on every platform. Without it, the JVM is allowed to use extra precision on some operations for performance. In practice, it is rarely used today because modern JVMs already give consistent results, but the keyword still exists.

```java
// strictfp: guarantee identical results across platforms
strictfp double computePI() {
    double sum = 0.0;
    for (int i = 0; i < 1000000; i++) {
        sum += 1.0 / (i + 1);
    }
    return sum;
}
```

**`super`** — Refers to the immediate superclass of the current class. Use `super()` to call the superclass's constructor, and `super.methodName()` to call an overridden method on the superclass. It is the way a subclass can build on what the parent provides instead of replacing it entirely.

```java
public class SavingsAccount extends Account {
    private double interestRate;

    public SavingsAccount(String owner, double balance, double rate) {
        super(owner, balance);     // call Account's constructor
        this.interestRate = rate;
    }

    @Override
    public void deposit(double amount) {
        super.deposit(amount);     // reuse the parent's deposit logic
        // then add interest-specific behaviour if needed
    }
}
```

**`switch`** — A multi-way branch based on the value of an expression. It compares the expression against `case` labels and runs the matching branch. Java has two forms: the traditional `switch` statement with fall-through, and the newer switch expression (Java 14+) that returns a value and does not fall through.

```java
// switch statement
int day = 3;
String dayName;
switch (day) {
    case 1: dayName = "Monday"; break;
    case 2: dayName = "Tuesday"; break;
    case 3: dayName = "Wednesday"; break;
    default: dayName = "Unknown";
}

// switch expression (cleaner, returns a value)
String dayName2 = switch (day) {
    case 1 -> "Monday";
    case 2 -> "Tuesday";
    case 3 -> "Wednesday";
    default -> "Unknown";
};
```

**`synchronized`** — Used to make a block or method thread-safe by acquiring an intrinsic lock. Only one thread can execute a `synchronized` block on a given object at a time; other threads block until the lock is released. It is an older concurrency tool — `java.util.concurrent` provides more granular options today, but `synchronized` is still the simplest way to protect shared state.

```java
// Thread-safe counter using synchronized
public class Counter {
    private int count = 0;

    public synchronized void increment() {
        count++;
    }

    public synchronized int get() {
        return count;
    }
}
```

**`this`** — Refers to the current instance of the class. Use it to distinguish an instance field from a parameter with the same name, to pass the current object to another method, or to call another constructor in the same class with `this(...)`.

```java
public class User {
    private String name;

    public User(String name) {
        this.name = name;   // 'this.name' is the field; 'name' is the parameter
    }

    public User withName(String newName) {
        return new User(newName);
    }
}
```

**`throw`** — Throws an exception explicitly. The `throw` statement takes an exception object (either a new one or one you caught and are re-throwing) and hands it to the JVM, which then looks for a `catch` block that can handle it.

```java
void setAge(int age) {
    if (age < 0) {
        throw new IllegalArgumentException("age cannot be negative: " + age);
    }
    this.age = age;
}
```

**`throws`** — Declares which checked exceptions a method might propagate to its caller. It does not throw the exception itself; it documents the contract so callers know they must handle or declare those exceptions. Only checked exceptions need to appear in a `throws` clause; unchecked exceptions (like `IllegalArgumentException`) do not.

```java
// This method declares that it may throw IOException
public String readConfig(String path) throws IOException {
    return Files.readString(Paths.get(path));
}
```

**`transient`** — Marks a field as not part of an object's serialized form. When an object is serialized (converted to a byte stream for storage or transmission), `transient` fields are skipped. Use it for fields that should not be saved — temporary caches, derived values, or sensitive data that should not leave memory.

```java
public class Session {
    private String username;
    private String token;

    // The password hash should not be serialised to disk or a queue
    private transient String passwordHash;
}
```

**`try`** — Introduces a block of code that might throw an exception. The `try` block is followed by one or more `catch` blocks that handle specific exception types, and optionally a `finally` block for cleanup. The `try-with-resources` form (Java 7+) automatically closes resources that implement `AutoCloseable`.

```java
// Basic try-catch-finally
try {
    FileReader reader = new FileReader("data.txt");
    // read the file...
} catch (FileNotFoundException e) {
    System.out.println("file not found");
} catch (IOException e) {
    System.out.println("read error");
}

// try-with-resources: reader is closed automatically
try (FileReader reader = new FileReader("data.txt")) {
    // read the file; reader closes even if an exception occurs
} catch (IOException e) {
    System.out.println("error: " + e.getMessage());
}
```

**`void`** — Indicates that a method does not return a value. It is not a type you can store in a variable; it only appears in a method declaration. A `void` method still does work — it might print, update state, or throw an exception — but it hands nothing back to the caller.

```java
// void: the method does work but returns nothing
public void printBalance() {
    System.out.println("balance: " + balance);
}
```

**`volatile`** — Marks a field as always being read from and written to main memory, not cached in a thread's local registers or CPU cache. This guarantees that changes made by one thread are immediately visible to other threads, which is weaker than a lock but sufficient for certain simple flags.

```java
// volatile: one thread's write is immediately visible to others
public class Worker {
    private volatile boolean running = true;

    public void run() {
        while (running) {
            // do work...
        }
    }

    public void stop() {
        running = false;
    }
}
```

**`while`** — Introduces a `while` loop, which tests a condition before each iteration and runs the body only while the condition is true. Unlike `do-while`, a `while` loop may execute zero times if the condition is false at the start.

```java
int n = 10;
while (n > 0) {
    System.out.println(n);
    n--;
}
```

### Group 3 — Class and Object Keywords

These are the keywords that define the type system and relationships between types.

- **`class`** — the blueprint for objects.
- **`interface`** — a contract that classes can implement.
- **`enum`** — a fixed set of constant values, as a full class.
- **`extends`** — inheritance — a class or interface derives from a parent.
- **`implements`** — a class fulfills an interface contract.
- **`instanceof`** — tests whether an object is of a given type.
- **`new`** — creates a new object or array.
- **`super`** — refers to the parent class.
- **`this`** — refers to the current object.
- **`sealed`**, **`non-sealed`**, **`permits`** — (Java 17+) control which types may extend or implement a type.

### Group 4 — Error-Handling Keywords

- **`try`** — a block that might throw.
- **`catch`** — handles a thrown exception.
- **`finally`** — always runs after try, for cleanup.
- **`throw`** — throws an exception explicitly.
- **`throws`** — declares what checked exceptions a method may propagate.
- **`assert`** — a debug-time assertion that fails with an error if false.

### Group 5 — Special and Transitional Keywords

- **`abstract`** — incomplete class or method.
- **`final`** — cannot be changed, overridden, or subclassed.
- **`native`** — implemented in native code, not Java.
- **`static`** — belongs to the class.
- **`strictfp`** — strict floating-point rules.
- **`synchronized`** — thread-safe access via intrinsic lock.
- **`transient`** — excluded from serialization.
- **`volatile`** — always reads/writes main memory.
- **`const`** — reserved, unused.
- **`goto`** — reserved, unused.

(Plus `null`, `true`, and `false` are literals, not keywords, but you cannot use them as identifiers either.)

## A Code Example — A Small Class That Uses Many Keywords

This example brings several keywords together in one realistic class. Read it and notice which keyword does what.

```java
// package — this file belongs in the com.academy.model package
package com.academy.model;

// import — we can write List instead of java.util.List
import java.util.List;

// public — this class is part of the API
// abstract — not meant to be instantiated directly
public abstract class Payment {
    // final — the reference cannot change; the id is set once
    private final String id;
    // protected — subclasses and same-package classes can see it
    protected double amount;

    // Constructor
    public Payment(String id, double amount) {
        this.id = id;        // 'this.id' = field; 'id' = parameter
        this.amount = amount;
    }

    // abstract — every concrete payment must define how to execute
    public abstract void execute();

    // static — belongs to the class, not any instance
    public static Payment parse(String line) {
        String[] parts = line.split(",");
        return new CreditCardPayment(parts[0], Double.parseDouble(parts[1]));
    }

    // getter
    public String getId() {
        return id;
    }
}

// final — this class cannot be subclassed
final class CreditCardPayment extends Payment {
    private final String lastFour;

    public CreditCardPayment(String id, double amount) {
        super(id, amount);      // call Payment's constructor
        this.lastFour = id;     // 'this.lastFour' = field
    }

    @Override
    public void execute() {
        System.out.println("charging card ending " + lastFour +
                           " for " + amount);
    }
}

// A small program that uses the classes
class Demo {
    public static void main(String[] args) {
        List<Payment> payments = List.of(
            new CreditCardPayment("1234", 49.99),
            new CreditCardPayment("5678", 12.50)
        );

        for (Payment p : payments) {       // enhanced for loop
            if (p instanceof CreditCardPayment cc) {   // pattern-matching instanceof
                System.out.println("Card " + cc.lastFour + " — $" + p.amount);
                p.execute();
            }
        }
    }
}
```

Line by line, here are the keywords at work:

- **`package`** — puts `Payment` in `com.academy.model`.
- **`import`** — lets us write `List` instead of `java.util.List`.
- **`public`, `private`, `protected`** — control who can see each member.
- **`abstract`** on `Payment` — you cannot write `new Payment(...)`, only concrete subclasses.
- **`final`** on `CreditCardPayment` — no class may extend it.
- **`extends`** — `CreditCardPayment` inherits from `Payment`.
- **`this`** — `this.id = id` distinguishes the field from the parameter.
- **`super`** — `super(id, amount)` calls the parent constructor.
- **`static`** — `parse` belongs to `Payment`, not to any instance.
- **`new`** — `new CreditCardPayment(...)` creates objects.
- **`return`** — `getId` returns the `id` field; `main` returns nothing (`void`).
- **`void`** — `main` and `execute` return nothing.
- **`for` (enhanced)** — `for (Payment p : payments)` iterates over the list.
- **`if`** — tests the condition.
- **`instanceof` with pattern matching** — checks if `p` is a `CreditCardPayment` and, if so, binds it to `cc`.
- **`@Override`** — not a keyword, but an annotation that tells the compiler you intend to override a method; if you get the signature wrong, the compiler catches it.

## Where This Shows Up in an Organization

The keywords are not academic trivia — they are the language you use every day. When you review code, you are constantly reading `private` vs `public` to judge encapsulation, `final` to judge whether a value is safe to trust, `static` to judge whether a method is stateless, `synchronized` to judge thread safety, and `transient` to judge what gets saved during serialization.

The `sealed` / `non-sealed` / `permits` keywords (Java 17+) are increasingly used in modern codebases to model closed hierarchies — for example, an `OrderStatus` that is exactly `PENDING`, `SHIPPED`, or `DELIVERED` and cannot be extended by accident. Before sealed classes, you used `enum` for this, but enums cannot have behaviour as rich as a class hierarchy. Sealed classes give you the safety of an enum with the flexibility of a class.

The `assert` keyword shows up in tests and in internal invariant checks. It is common to write `assert list != null : "list must be initialised";` inside a method that assumes the list has been set up earlier, so a bug that violates that assumption is caught immediately during development. The key rule is: assertions are for conditions that should never be false in correct code; for user input and external data, you use real `if` checks and throw real exceptions.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Using a keyword as a variable name, like `int class = 5` | Keywords look like ordinary words | The compiler catches this immediately; pick a different name like `klass` or `category` |
| Confusing `final` with immutability | `final` on an object reference only prevents reassigning the reference, not changing the object's fields | For truly immutable objects, make the class `final`, fields `private final`, and not expose mutators |
| Forgetting that `boolean` is the only type you can use in `if` | Coming from languages where `0` means false and non-zero means true | Write explicit comparisons: `if (count > 0)`, not `if (count)` |
| Using `goto` or `const` as identifiers | They are reserved and feel like normal words | Never use them as names; the compiler will reject them |
| Thinking `null` is a keyword | It looks like one | `null` is a literal; you still cannot name a variable `null`, but it is not in the 50-keyword count |
| Overusing `public` | It is the easiest access level to reach for | Start with the most restrictive level (`private`) and widen only when another class genuinely needs access |
| Using `volatile` as a lock | `volatile` guarantees visibility but not atomicity | For compound actions like `count++`, use `synchronized` or `AtomicInteger`, not `volatile` |

## For the Practice Lab

In the lab version of this lesson, you will see a starter file `KeywordDemo.java` with several deliberate mistakes — a keyword used as a variable name, a missing `break` in a switch, an `if` that uses an `int` as a condition, and a missing `final` where a value should be constant. Fix each one, then add your own short examples using `sealed`/`non-sealed`, `record` (a special kind of class, covered in a later lesson), and a `try-with-resources` block that opens and automatically closes a `StringReader`.

## Summary

Java's 50 keywords are the language's reserved vocabulary. They fall into five groups: declaration keywords (`class`, `interface`, `enum`, `abstract`, `final`, `static`, `strictfp`, `native`, `volatile`, `transient`, `synchronized`, `const`, `goto`), control-flow keywords (`if`, `else`, `switch`, `case`, `default`, `for`, `while`, `do`, `break`, `continue`, `return`), class and object keywords (`extends`, `implements`, `instanceof`, `new`, `super`, `this`, `sealed`, `non-sealed`, `permits`), error-handling keywords (`try`, `catch`, `finally`, `throw`, `throws`, `assert`), and the type and modifier keywords (`boolean`, `byte`, `char`, `short`, `int`, `long`, `float`, `double`, `void`, `package`, `import`, `private`, `protected`, `public`). Two reserved words — `const` and `goto` — are unused today. Three literals — `null`, `true`, `false` — behave like keywords but are technically not part of the 50. Every Java program you write is built from these words, so knowing what each one does is the foundation of reading and writing Java confidently.
