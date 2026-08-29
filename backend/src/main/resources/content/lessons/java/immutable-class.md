---
title: Immutable Classes — Thread-Safe Objects by Design
summary: How to build truly immutable classes, why final fields matter, the copy-constructor pattern, immutable collections, and how organizations use immutability for caching, DTOs, and thread safety.
order: 63
minutes: 22
topics: [immutable-class, final-fields, defensive-copy, immutable-collection, thread-safety, value-object]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/imstrat.html
  - https://docs.oracle.com/javase/8/docs/api/java/lang/immutable-class.html
---

# Immutable Classes — Thread-Safe Objects by Design

## The concept — what makes a class "immutable"?

An **immutable object** is one whose state **cannot change** after it is created. No method can modify its fields. Once you create an `ImmutablePoint(3, 4)`, the x and y values will be 3 and 4 forever, no matter what code runs afterward.

**Why does this matter?**
- **Thread safety:** Multiple threads can read an immutable object without locks, synchronization, or volatile. It's safe by design.
- **Predictability:** No hidden side effects. When you pass an object to a method, you know it won't be silently modified.
- **Cacheability:** Immutable objects are safe to cache, reuse, and share freely.
- **Hash-friendly:** `hashCode()` never changes, so the object works correctly as a HashMap key.

**Beginner mental model:** An immutable object is like a printed document. You can read it, photocopy it, mail it to others — but you can't edit the original. If you need a modified version, you make a new copy with the changes.

## The recipe for an immutable class

There are 5 rules. Break any one and the class is no longer truly immutable:

```java
public final class Money {            // 1. Make the class final (no subclass can override methods)

    private final BigDecimal amount;   // 2. Make all fields final (assigned once in constructor, never changed)
    private final Currency currency;   //    and private (no setter can access them)

    // 3. Constructor initializes ALL fields
    public Money(BigDecimal amount, Currency currency) {
        this.amount = amount;          // no defensive copy needed for BigDecimal (it's immutable itself)
        this.currency = currency;
    }

    // 4. No setters — only getters
    public BigDecimal getAmount() {
        return amount;
    }

    public Currency getCurrency() {
        return currency;
    }

    // 5. "Wither" methods return NEW objects instead of modifying this one
    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new CurrencyMismatchException();
        }
        return new Money(this.amount.add(other.amount), this.currency);  // NEW object
    }

    public Money withAmount(BigDecimal newAmount) {
        return new Money(newAmount, this.currency);  // NEW object with changed amount
    }
}
```

**Line-by-line explanation:**
- `final class` — prevents subclassing. A subclass could add a setter method, breaking immutability.
- `final BigDecimal amount` — once assigned in the constructor, this field can never be reassigned.
- `private` — no external code can reach the field directly (though even `public final` would be safe for truly immutable types).
- No setters — the only way to "change" a Money is to create a new one via `add()` or `withAmount()`.
- `this.amount.add(other.amount)` — `BigDecimal.add()` returns a new BigDecimal (BigDecimal is also immutable), so no state is mutated.

## Defensive copying — when your fields ARE mutable

If your class holds a mutable object (like `Date` or `List`), you must defend against external mutation:

```java
public final class Appointment {

    private final String title;
    private final Date startTime;    // Date is MUTABLE — someone could call startTime.setTime()!
    private final List<String> attendees;  // List is MUTABLE — someone could call attendees.add()!

    public Appointment(String title, Date startTime, List<String> attendees) {
        this.title = title;
        this.startTime = new Date(startTime.getTime());  // DEFENSIVE COPY — create a new Date
        this.attendees = List.copyOf(attendees);          // DEFENSIVE COPY — immutable wrapper
    }

    public Date getStartTime() {
        return new Date(startTime.getTime());  // DEFENSIVE COPY — return a new Date, not the original
    }

    public List<String> getAttendees() {
        return attendees;  // safe — List.copyOf returns an unmodifiable list
    }
}
```

**Why the defensive copy in the constructor?** If someone passes a `Date` object and then mutates it afterward, our Appointment would silently change. The copy breaks that link:

```java
Date sharedDate = new Date();
Appointment apt = new Appointment("Meeting", sharedDate, List.of("Alice"));

// Without defensive copy: apt.getStartTime() would reflect sharedDate's mutation!
sharedDate.setTime(0);  // sets to epoch — without defensive copy, apt's time is now 0
// With defensive copy: apt.getStartTime() still returns the original time
```

## The modern alternative: records (Java 16+)

Records give you immutability for free — all fields are `final`, there are no setters, and `equals()`/`hashCode()`/`toString()` are auto-generated:

```java
public record Money(BigDecimal amount, Currency currency) {
    // That's it. This is a fully immutable class with:
    // - final fields (enforced by the compiler)
    // - No setters (records don't allow them)
    // - Constructor validation (add a compact constructor)
    // - equals(), hashCode(), toString() auto-generated

    // Add validation in a compact constructor
    public Money {
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("Money cannot be negative");
        }
        if (currency == null) {
            throw new IllegalArgumentException("Currency must not be null");
        }
    }

    // Custom behavior
    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new CurrencyMismatchException();
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }
}
```

## How we use it in organizations

### Scenario 1: Thread-safe caching with immutable keys

HashMap keys must not change. Immutable objects are perfect keys:

```java
public class LocationCache {
    // Key: immutable GeoPoint — safe because it can never change
    private final Map<GeoPoint, WeatherData> cache = new ConcurrentHashMap<>();

    public WeatherData getWeather(double lat, double lon) {
        GeoPoint point = new GeoPoint(lat, lon);  // immutable — safe as key
        return cache.computeIfAbsent(point, this::fetchWeather);
    }
}

// GeoPoint is immutable — perfect for caching and concurrent access
public record GeoPoint(double latitude, double longitude) {
    public GeoPoint {
        if (latitude < -90 || latitude > 90) throw new IllegalArgumentException("Invalid latitude");
        if (longitude < -180 || longitude > 180) throw new IllegalArgumentException("Invalid longitude");
    }
}
```

### Scenario 2: Safe API responses — no mutation after sending

```java
// BAD: mutable DTO — the controller can accidentally modify the response
public class UserResponse {
    private String name;     // public or with setters — mutable!
    private String email;
    // Spring serializes this, but any interceptor can modify it
}

// GOOD: immutable DTO — safe to cache, serialize, and share across threads
public record UserResponse(String name, String email, Instant createdAt) {
    // No setters. No mutable fields. Thread-safe by design.
    // Spring handles record serialization perfectly with Jackson.
}
```

### Scenario 3: Event sourcing — immutable events

In event-driven architectures, events must be immutable (you can't change history):

```java
// Each event is immutable — once created, it's permanent
public record OrderCreated(String orderId, String customerId, List<OrderItem> items, Instant timestamp) {
    public OrderCreated {
        items = List.copyOf(items);  // defensive copy — items list is now unmodifiable
    }
}

public record OrderShipped(String orderId, String trackingNumber, Instant timestamp) {}

// Event store — events are append-only, never modified
public class EventStore {
    private final List<OrderEvent> events = new CopyOnWriteArrayList<>();

    public void append(OrderEvent event) {
        events.add(event);  // append only — never modify, never remove
    }

    public List<OrderEvent> getEvents(String orderId) {
        return events.stream()
            .filter(e -> e.orderId().equals(orderId))
            .toList();  // returns immutable list
    }
}
```

### Scenario 4: Builder pattern for complex immutable objects

When a class has many optional fields, a builder makes construction readable:

```java
public final class HttpRequest {
    private final String url;
    private final String method;
    private final Map<String, String> headers;
    private final byte[] body;
    private final Duration timeout;

    private HttpRequest(Builder builder) {
        this.url = builder.url;
        this.method = builder.method;
        this.headers = Map.copyOf(builder.headers);  // immutable copy
        this.body = builder.body != null ? builder.body.clone() : new byte[0];  // defensive copy
        this.timeout = builder.timeout;
    }

    public static class Builder {
        private final String url;              // required
        private String method = "GET";         // default
        private Map<String, String> headers = new HashMap<>();
        private byte[] body = null;
        private Duration timeout = Duration.ofSeconds(30);

        public Builder(String url) { this.url = url; }
        public Builder method(String m) { this.method = m; return this; }
        public Builder header(String k, String v) { headers.put(k, v); return this; }
        public Builder body(byte[] b) { this.body = b; return this; }
        public Builder timeout(Duration t) { this.timeout = t; return this; }
        public HttpRequest build() { return new HttpRequest(this); }
    }
}

// Usage: fluent, readable, immutable result
HttpRequest request = new HttpRequest.Builder("https://api.example.com/users")
    .method("POST")
    .header("Content-Type", "application/json")
    .body(jsonBytes)
    .timeout(Duration.ofSeconds(5))
    .build();
// request is now immutable — no one can change its headers, body, or timeout
```

## Comparison: mutable vs immutable

| Aspect | Mutable Class | Immutable Class |
|---|---|---|
| Thread safety | Requires synchronization | Safe by design |
| Caching | Dangerous (may change) | Safe to cache freely |
| HashMap key | Can break if fields change | Always safe |
| Memory | One object modified in place | New objects for each "change" |
| API safety | Callers can modify shared state | Callers get copies or read-only views |
| Boilerplate | Fewer constructors, more setters | More constructors, no setters |

## Common mistakes

| Mistake | Consequence |
|---|---|
| Making class `final` but leaving fields non-final | Subclass can override setters — not truly immutable |
| Holding a mutable List without defensive copy | External code can modify the list after construction |
| Returning a mutable Date directly | Caller can mutate the internal state |
| Using `this.field = field` without validation | Null or invalid values locked in forever |
| Making everything immutable when mutability is needed | Unnecessary object creation in hot loops |
