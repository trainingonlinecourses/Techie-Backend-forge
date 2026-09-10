---
title: OOP & Encapsulation — Classes, Interfaces, Records, Polymorphism
summary: The four pillars of OOP explained for beginners: encapsulation with private fields, inheritance with the fragile base class problem, polymorphism as the foundation of Spring DI, abstraction through interfaces and records, and composition over inheritance.
order: 41
minutes: 35
topics: [oop, encapsulation, polymorphism, records, interfaces, inheritance, composition, abstraction]
docs:
  - https://docs.oracle.com/javase/tutorial/java/concepts/
  - https://docs.oracle.com/en/java/javase/21/language/records.html
---

# OOP & Encapsulation — Classes, Interfaces, Records, Polymorphism

## What is Object-Oriented Programming?

OOP is a way of organizing code around **objects** — bundles of data (fields) and behavior (methods) that model real-world things. Instead of writing one giant file with all the logic, you create small, focused classes that each handle one responsibility.

**Beginner mental model:** Think of a car. A car has properties (color, speed, fuel level) and behaviors (accelerate, brake, refuel). In Java, you'd model this as a class:


**What this code does — step by step:**

1. PROPERTIES (fields) — what the car HAS
2. `private String color;` — private = only this class can access it
3. `private int speed;` — current speed in km/h
4. `private double fuelLevel;` — percentage (0.0 to 100.0)
5. CONSTRUCTOR — called when you create a new Car
6. `this.color = color;` — 'this' refers to this object's field
7. `this.speed = 0;` — new car starts at 0 speed
8. BEHAVIOR (methods) — what the car DOES
9. `if (fuelLevel <= 0) {` — can't accelerate without fuel
10. `return;` — exit the method early
11. `speed += amount;` — increase speed
12. `fuelLevel -= amount * 0.1;` — fuel decreases as you speed up
13. `speed = Math.max(0, speed - 20);` — reduce speed, minimum 0
14. GETTER — lets other classes READ the value (but not change it)
15. Note: no setSpeed() — we control speed changes through accelerate() and brake()
16. USING the class:
17. `Car myCar = new Car("Red", 100.0);` — create a new Car object
18. `myCar.accelerate(50);` — speed is now 50
19. `System.out.println(myCar.getSpeed());` — prints 50
20. `myCar.brake();` — speed is now 30

The same code, clean:

```java
public class Car {
    private String color;
    private int speed;
    private double fuelLevel;

    public Car(String color, double initialFuel) {
        this.color = color;
        this.speed = 0;
        this.fuelLevel = initialFuel;
    }

    public void accelerate(int amount) {
        if (fuelLevel <= 0) {
            System.out.println("Out of fuel!");
            return;
        }
        speed += amount;
        fuelLevel -= amount * 0.1;
    }

    public void brake() {
        speed = Math.max(0, speed - 20);
    }

    public int getSpeed() { return speed; }
    public String getColor() { return color; }
}

Car myCar = new Car("Red", 100.0);
myCar.accelerate(50);
System.out.println(myCar.getSpeed());
myCar.brake();
```

## The Four Pillars of OOP

### Pillar 1: Encapsulation — hiding internal details

**Encapsulation** means keeping fields `private` and providing controlled access through methods. The class protects its own data — no external code can put it in an invalid state.


**What this code does — step by step:**

1. BAD: no encapsulation — anyone can set balance to anything
2. `public double balance;` — PUBLIC — any code can modify this directly
3. Problem: bankAccount.balance = -1000000; — invalid state, no validation!
4. GOOD: encapsulated — the class controls its own state
5. `private double balance;` — PRIVATE — only this class can access it
6. `balance += amount;` — validated — no invalid deposits
7. `balance -= amount;` — validated — no overdrafts
8. `return balance;` — read-only access — no setter!

The same code, clean:

```java
public class BankAccount {
    public double balance;
}

public class BankAccount {
    private double balance;

    public BankAccount(double initialBalance) {
        if (initialBalance < 0) {
            throw new IllegalArgumentException("Initial balance cannot be negative");
        }
        this.balance = initialBalance;
    }

    public void deposit(double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Deposit must be positive");
        }
        balance += amount;
    }

    public void withdraw(double amount) {
        if (amount > balance) {
            throw new InsufficientFundsException("Cannot withdraw " + amount);
        }
        balance -= amount;
    }

    public double getBalance() {
        return balance;
    }
}
```

**Why this matters:** If `balance` were public, any code could set it to `-999999` and corrupt the account. With encapsulation, every change goes through `deposit()` or `withdraw()`, which validate the operation.

### Pillar 2: Inheritance — "is-a" relationship

Inheritance lets a class inherit fields and methods from a parent class. Use it when the child genuinely IS-A type of the parent.


**What this code does — step by step:**

1. Parent class (superclass)
2. `protected String color;` — protected = accessible by subclasses
3. Method that subclasses can override
4. `return 0;` — default — subclasses should override this
5. Child class (subclass) — extends Shape
6. `super(color);` — calls Shape's constructor — must be FIRST line
7. `@Override` — tells compiler: "I'm overriding a parent method"
8. `return Math.PI * radius * radius;` — Circle-specific calculation
9. Another child class
10. `return width * height;` — Rectangle-specific calculation
11. POLYMORPHISM: same method call, different behavior
12. `System.out.println(s1.area());` — 78.54 — Circle's area()
13. `System.out.println(s2.area());` — 24.0 — Rectangle's area()
14. Java automatically calls the correct version based on the ACTUAL object type

The same code, clean:

```java
public class Shape {
    protected String color;

    public Shape(String color) {
        this.color = color;
    }

    public String getColor() { return color; }

    public double area() {
        return 0;
    }
}

public class Circle extends Shape {
    private double radius;

    public Circle(String color, double radius) {
        super(color);
        this.radius = radius;
    }

    @Override
    public double area() {
        return Math.PI * radius * radius;
    }
}

public class Rectangle extends Shape {
    private double width, height;

    public Rectangle(String color, double width, double height) {
        super(color);
        this.width = width;
        this.height = height;
    }

    @Override
    public double area() {
        return width * height;
    }
}

Shape s1 = new Circle("Red", 5.0);
Shape s2 = new Rectangle("Blue", 4.0, 6.0);

System.out.println(s1.area());
System.out.println(s2.area());
```

**The "fragile base class" problem:** If you change `Shape`, you might accidentally break `Circle` and `Rectangle`. This is why many teams prefer composition over inheritance (see below).

### Pillar 3: Polymorphism — one interface, many implementations

Polymorphism means "many forms." A single reference type can point to different object types, and the correct method is called at runtime.


**What this code does — step by step:**

1. This is EXACTLY how Spring Dependency Injection works:
2. The SERVICE doesn't know or care which implementation it's using:
3. `private final PaymentProcessor processor;` — depends on the INTERFACE
4. `this.processor = processor;` — Spring injects the right one
5. `PaymentResult result = processor.process(order.payment());` — polymorphic call. Could be StripeProcessor or PayPalProcessor — OrderService doesn't know

The same code, clean:

```java
interface PaymentProcessor {
    PaymentResult process(PaymentRequest request);
}

class StripeProcessor implements PaymentProcessor {
    public PaymentResult process(PaymentRequest request) {
        return stripeGateway.charge(request.cardToken(), request.amount());
    }
}

class PayPalProcessor implements PaymentProcessor {
    public PaymentResult process(PaymentRequest request) {
        return paypalGateway.charge(request.email(), request.amount());
    }
}

public class OrderService {
    private final PaymentProcessor processor;

    public OrderService(PaymentProcessor processor) {
        this.processor = processor;
    }

    public Order checkout(Order order) {
        PaymentResult result = processor.process(order.payment());
    }
}
```

### Pillar 4: Abstraction — hiding complexity behind simple contracts

Abstraction means showing only the essential features and hiding the implementation details.


**What this code does — step by step:**

1. ABSTRACTION: the user doesn't need to know HOW email sending works
2. Implementation hides all the complexity
3. 50 lines of SMTP protocol, connection pooling, retry logic, etc. The caller doesn't see any of this — they just call sendEmail()
4. Caller only sees the simple interface:
5. They don't know about SMTP, MIME encoding, TLS handshake, or retry logic

The same code, clean:

```java
interface EmailService {
    void sendEmail(String to, String subject, String body);
}

@Service
public class SmtpEmailService implements EmailService {
    public void sendEmail(String to, String subject, String body) {
    }
}

emailService.sendEmail("alice@example.com", "Welcome!", "Hello Alice!");
```

## Records — immutable data classes (Java 16+)

Records are the modern way to create immutable data carriers. They automatically generate constructor, getters, `equals()`, `hashCode()`, and `toString()`:


**What this code does — step by step:**

1. OLD WAY: 50+ lines of boilerplate for a simple data class
2. `private final String name;` — final = can't change after construction
3. `public UserOld(String name, String email, int age) {` — constructor
4. `public String getName() { return name; }` — getter
5. `@Override public boolean equals(Object o) {` — 10+ lines of equals
6. NEW WAY: records do ALL of this automatically
7. That's it. One line. You get: ✅ Constructor: new User("Alice", "alice@example.com", 30). ✅ Getters: user.name(), user.email(), user.age() (no 'get' prefix!). ✅ equals(): compares all fields. ✅ hashCode(): based on all fields. ✅ toString(): "User[name=Alice, email=alice@example.com, age=30]"
8. Add validation in a "compact constructor" (no parameter list)
9. Add custom methods as needed
10. Usage:
11. `System.out.println(alice.name());` — "Alice" — no getName() needed
12. `System.out.println(alice.displayName());` — "Alice (alice@example.com)"
13. Records are IMMUTABLE — no setters, all fields are final. Alice.age = 31; // COMPILE ERROR — can't modify a record's fields

The same code, clean:

```java
public class UserOld {
    private final String name;
    private final String email;
    private final int age;

    public UserOld(String name, String email, int age) {
        this.name = name;
        this.email = email;
        this.age = age;
    }

    public String getName() { return name; }
    public String getEmail() { return email; }
    public int getAge() { return age; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserOld u)) return false;
        return age == u.age && name.equals(u.name) && email.equals(u.email);
    }

    @Override public int hashCode() { return Objects.hash(name, email, age); }

    @Override public String toString() { return "UserOld{name='" + name + "', email='" + email + "', age=" + age + "}"; }
}

public record User(String name, String email, int age) {

    public User {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Name required");
        if (email == null || !email.contains("@")) throw new IllegalArgumentException("Invalid email");
        if (age < 0 || age > 150) throw new IllegalArgumentException("Invalid age");
    }

    public String displayName() {
        return name + " (" + email + ")";
    }
}

User alice = new User("Alice", "alice@example.com", 30);
System.out.println(alice.name());
System.out.println(alice.displayName());
```

## Composition over Inheritance — the modern preference


**What this code does — step by step:**

1. INHERITANCE (fragile — changing parent breaks children)
2. `class Car extends Vehicle {` — Car IS-A Vehicle
3. `Engine engine;` — Car also HAS-A Engine — should be composition!
4. COMPOSITION (flexible — changing Engine doesn't break Car)
5. `private final Engine engine;` — Car HAS-A Engine
6. `private final List<Tire> tires;` — Car HAS-A tires
7. `private final FuelTank fuelTank;` — Car HAS-A fuel tank
8. `this.engine = engine;` — injected — easy to swap for electric engine
9. `engine.start();` — delegate to the engine
10. Now you can easily swap engines without changing Car:

The same code, clean:

```java
class Car extends Vehicle {
    Engine engine;
}

class Car {
    private final Engine engine;
    private final List<Tire> tires;
    private final FuelTank fuelTank;

    public Car(Engine engine, List<Tire> tires, FuelTank fuelTank) {
        this.engine = engine;
        this.tires = tires;
        this.fuelTank = fuelTank;
    }

    public void start() {
        engine.start();
    }
}

Car gasCar = new Car(new GasEngine(), tires, new FuelTank());
Car electricCar = new Car(new ElectricEngine(), tires, new Battery());
```

## How we use it in organizations

### Scenario 1: Encapsulation prevents data corruption in a banking system


**What this code does — step by step:**

1. `private final String id;` — immutable — never changes
2. `private Money balance;` — encapsulated — only modified through methods
3. `private final List<Transaction> history = new ArrayList<>();` — private list
4. `throw new InsufficientFundsException(id);` — validate before modifying
5. `balance = balance.subtract(amount);` — update state
6. `history.add(new Transaction(TransactionType.DEBIT, amount, Instant.now()));` — audit trail
7. `public Money getBalance() { return balance; }` — read-only access
8. Returns a COPY of history — not the internal list
9. `return List.copyOf(history);` — defensive copy

The same code, clean:

```java
public class Account {
    private final String id;
    private Money balance;
    private final List<Transaction> history = new ArrayList<>();

    public Account(String id, Money openingBalance) {
        this.id = Objects.requireNonNull(id);
        this.balance = Objects.requireNonNull(openingBalance);
    }

    public void debit(Money amount) {
        if (amount.compareTo(balance) > 0) {
            throw new InsufficientFundsException(id);
        }
        balance = balance.subtract(amount);
        history.add(new Transaction(TransactionType.DEBIT, amount, Instant.now()));
    }

    public Money getBalance() { return balance; }

    public List<Transaction> getHistory() {
        return List.copyOf(history);
    }
}
```

### Scenario 2: Polymorphism enables the Strategy pattern


**What this code does — step by step:**

1. Different pricing strategies — all implement the same interface
2. `return order.getSubtotal();` — full price
3. `return order.getSubtotal().multiply(0.9);` — 10% discount
4. `return order.getSubtotal().multiply(0.5);` — 50% off
5. The order service doesn't know which pricing strategy it's using:
6. `return strategy.calculatePrice(order);` — polymorphic — strategy decides the price

The same code, clean:

```java
interface PricingStrategy {
    Money calculatePrice(Order order);
}

class StandardPricing implements PricingStrategy {
    public Money calculatePrice(Order order) {
        return order.getSubtotal();
    }
}

class MemberPricing implements PricingStrategy {
    public Money calculatePrice(Order order) {
        return order.getSubtotal().multiply(0.9);
    }
}

class FlashSalePricing implements PricingStrategy {
    public Money calculatePrice(Order order) {
        return order.getSubtotal().multiply(0.5);
    }
}

public class OrderService {
    public Money calculateTotal(Order order, PricingStrategy strategy) {
        return strategy.calculatePrice(order);
    }
}
```

### Scenario 3: Sealed classes for type-safe state machines (Java 17+)

// A ride-sharing order can only be in specific states — sealed class enforces this
public sealed interface OrderState permits
        OrderState.Created,
        OrderState.Accepted,
        OrderState.InProgress,
        OrderState.Completed,
```java
        OrderState.Cancelled {

    record Created(Instant createdAt) implements OrderState {}
    record Accepted(Driver driver, Instant acceptedAt) implements OrderState {}
    record InProgress(GeoLocation currentLocation) implements OrderState {}
    record Completed(Instant completedAt, Money fare) implements OrderState {}
    record Cancelled(String reason, Instant cancelledAt) implements OrderState {}
}

// Pattern matching switch — compiler ensures ALL states are handled:
public String describeState(OrderState state) {
    return switch (state) {
        case Created c    -> "Order created at " + c.createdAt();
        case Accepted a   -> "Driver " + a.driver().name() + " accepted";
        case InProgress i -> "In progress at " + i.currentLocation();
        case Completed c  -> "Completed, fare: " + c.fare();
        case Cancelled c  -> "Cancelled: " + c.reason();
        // No 'default' needed — compiler knows all cases are covered!
    };
}
```

## Composition vs Inheritance — decision guide

| Use INHERITANCE when | Use COMPOSITION when |
|---|---|
| True "is-a" relationship (Circle IS-A Shape) | "Has-a" relationship (Car HAS-A Engine) |
| All subclasses share the same core behavior | Different components have different lifecycles |
| You control the full class hierarchy | You need to swap implementations at runtime |
| Template Method pattern (fixed algorithm, varying steps) | Strategy pattern (swap algorithms dynamically) |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Making fields public | Any code can corrupt object state | Use private fields + getters |
| Using inheritance for code reuse (not "is-a") | Fragile base class — changing parent breaks children | Use composition |
| Forgetting `@Override` | Typos silently create new methods instead of overriding | Always add `@Override` |
| Exposing mutable internal collections | External code modifies your private state | Return `List.copyOf()` or unmodifiable views |
| Using `==` to compare objects | Compares references, not values | Use `.equals()` (records generate it for you) |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
