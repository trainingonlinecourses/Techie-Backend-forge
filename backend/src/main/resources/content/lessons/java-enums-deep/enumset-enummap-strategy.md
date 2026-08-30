---
title: EnumSet, EnumMap & Strategy Pattern — Enums Beyond Basics
summary: Using EnumSet for bit-vector-fast set operations, EnumMap for enum-keyed performance, and implementing the Strategy pattern with enums that have abstract methods.
order: 2
minutes: 22
topics: [enumset, enummap, strategy-pattern, enum-abstract-methods, enum-state-machine]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/EnumSet.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/EnumMap.html
---

## The Concept, From Zero

Java enums are not just named constants — they are **full classes** that can have fields, methods, constructors, and even abstract methods. When you combine this with `EnumSet` and `EnumMap`, you get data structures that are **orders of magnitude faster** than their generic counterparts (`HashSet`, `HashMap`).

**Why does this matter?**

- `EnumSet` uses a **bit vector** internally — adding, removing, and checking membership is a single bitwise operation. It's 10-100x faster than `HashSet` for enum values.
- `EnumMap` uses an **array indexed by ordinal** — lookup is O(1) with no hashing, no collision handling, and minimal memory.
- Enums with abstract methods enable the **Strategy pattern without interface classes** — each enum constant IS a strategy.

---

## EnumSet — Lightning-Fast Set Operations

### Creating EnumSets

```java
public enum Permission {
    READ, WRITE, EXECUTE, DELETE, ADMIN
}

// Empty set
EnumSet<Permission> none = EnumSet.noneOf(Permission.class);

// Full set (all constants)
EnumSet<Permission> all = EnumSet.allOf(Permission.class);

// Single value
EnumSet<Permission> read = EnumSet.of(Permission.READ);

// Multiple values
EnumSet<Permission> readWrite = EnumSet.of(Permission.READ, Permission.WRITE);

// Range (inclusive start, exclusive end)
EnumSet<Permission> basic = EnumSet.range(Permission.READ, Permission.EXECUTE);
// Result: {READ, WRITE, EXECUTE}

// Complement (everything NOT in the set)
EnumSet<Permission> restricted = EnumSet.complementOf(readWrite);
// Result: {EXECUTE, DELETE, ADMIN}
```

### Set Operations

```java
EnumSet<Permission> userPerms = EnumSet.of(Permission.READ, Permission.WRITE);
EnumSet<Permission> adminPerms = EnumSet.of(Permission.READ, Permission.WRITE, Permission.DELETE, Permission.ADMIN);

// Union
EnumSet<Permission> combined = EnumSet.copyOf(userPerms);
combined.addAll(adminPerms);
// Result: {READ, WRITE, DELETE, ADMIN}

// Intersection
EnumSet<Permission> common = EnumSet.copyOf(userPerms);
common.retainAll(adminPerms);
// Result: {READ, WRITE}

// Difference
EnumSet<Permission> onlyAdmin = EnumSet.copyOf(adminPerms);
onlyAdmin.removeAll(userPerms);
// Result: {DELETE, ADMIN}

// Membership check — O(1), uses bit position
boolean canDelete = userPerms.contains(Permission.DELETE);  // false
```

### Line-by-Line Walkthrough of the Internals

```java
// What EnumSet looks like internally (simplified)
// For 64 or fewer enum constants, it uses a single long:
class SmallEnumSet<E extends Enum<E>> extends AbstractEnumSet<E> {
    long elements;  // Bit vector! Each bit = one enum constant
    
    // Adding: just set a bit
    public boolean add(E e) {
        long oldElements = elements;
        elements |= (1L << e.ordinal());  // Bitwise OR — one CPU instruction!
        return elements != oldElements;
    }
    
    // Contains: just test a bit
    public boolean contains(Object e) {
        return (elements & (1L << ((Enum<?>)e).ordinal())) != 0;  // Bitwise AND
    }
    
    // Size: popcount (count set bits)
    public int size() {
        return Long.bitCount(elements);  // Hardware-level instruction
    }
}
```

**This is why EnumSet is so fast** — no hashing, no buckets, no collision chains. A single bitwise operation does the work.

---

## EnumMap — The Fastest Map for Enum Keys

```java
public enum Day {
    MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
}

// Create an EnumMap
EnumMap<Day, String> meetingRooms = new EnumMap<>(Day.class);

// Put values
meetingRooms.put(Day.MONDAY, "Room A");
meetingRooms.put(Day.TUESDAY, "Room B");
meetingRooms.put(Day.WEDNESDAY, "Room A");
meetingRooms.put(Day.THURSDAY, "Room C");
meetingRooms.put(Day.FRIDAY, "Room B");

// Get — uses ordinal as array index, no hashing
String room = meetingRooms.get(Day.WEDNESDAY);  // "Room A"

// Iteration order follows enum declaration order (MONDAY → SUNDAY)
for (Map.Entry<Day, String> entry : meetingRooms.entrySet()) {
    System.out.println(entry.getKey() + ": " + entry.getValue());
}
// Output: MONDAY: Room A, TUESDAY: Room B, WEDNESDAY: Room A, ...
```

### Why EnumMap Wins Over HashMap

```java
// HashMap: hash the key → find bucket → handle collisions → compare keys
// EnumMap: enum.ordinal() → array[ordinal] → done

// Memory: HashMap stores Entry objects with hash, key, value, next pointer
// EnumMap stores a flat array of values (null for missing entries)

// Benchmark: EnumMap.put() is ~3x faster than HashMap.put() for enum keys
// Benchmark: EnumMap.get() is ~4x faster than HashMap.get() for enum keys
```

---

## Strategy Pattern with Enums

This is where enums become truly powerful. Instead of creating separate classes for each strategy, each enum constant **IS** the strategy:

```java
// Without enums: you'd need an interface + 3 classes
// With enums: each constant implements the abstract method

public enum DiscountStrategy {
    // Each constant overrides calculateDiscount
    FLAT_10 {
        @Override
        public double calculate(double price) {
            return price - 10.0;
        }
    },
    
    PERCENT_20 {
        @Override
        public double calculate(double price) {
            return price * 0.80;
        }
    },
    
    BUY_ONE_GET_HALF {
        @Override
        public double calculate(double price) {
            return price * 0.75;  // Average of full + half price
        }
    };
    
    // Abstract method — each constant MUST implement this
    public abstract double calculate(double price);
    
    // Convenience method for the entire list
    public static void applyAll(double price) {
        for (DiscountStrategy strategy : values()) {
            System.out.printf("%s: $%.2f → $%.2f%n", 
                strategy.name(), price, strategy.calculate(price));
        }
    }
}

// Usage:
DiscountStrategy strategy = DiscountStrategy.PERCENT_20;
double discounted = strategy.calculate(100.0);  // 80.0

DiscountStrategy.applyAll(100.0);
// FLAT_10: $100.00 → $90.00
// PERCENT_20: $100.00 → $80.00
// BUY_ONE_GET_HALF: $100.00 → $75.00
```

### State Machine with Enums

```java
public enum OrderState {
    CREATED {
        public OrderState next() { return PAID; }
        public String describe() { return "Order placed, waiting for payment"; }
    },
    PAID {
        public OrderState next() { return SHIPPED; }
        public String describe() { return "Payment received, preparing for shipment"; }
    },
    SHIPPED {
        public OrderState next() { return DELIVERED; }
        public String describe() { return "Package in transit"; }
    },
    DELIVERED {
        public OrderState next() { return this; }  // Terminal state
        public String describe() { return "Package delivered successfully"; }
    };
    
    public abstract OrderState next();
    public abstract String describe();
}

// Usage:
OrderState state = OrderState.CREATED;
while (state != state.next()) {
    System.out.println(state.describe());
    state = state.next();
}
System.out.println(state.describe());
```

---

## Real-World Scenarios

### Scenario 1: Role-Based Access Control

```java
public enum Role {
    GUEST(Permission.READ),
    USER(Permission.READ, Permission.WRITE),
    EDITOR(Permission.READ, Permission.WRITE, Permission.EXECUTE),
    ADMIN(Permission.values());
    
    private final EnumSet<Permission> permissions;
    
    Role(Permission... perms) {
        this.permissions = EnumSet.copyOf(Arrays.asList(perms));
    }
    
    public boolean can(Permission perm) {
        return permissions.contains(perm);
    }
    
    public EnumSet<Permission> getPermissions() {
        return EnumSet.copyOf(permissions);
    }
}

// Usage:
Role userRole = Role.USER;
if (userRole.can(Permission.DELETE)) {
    // Never enters here — USER doesn't have DELETE
}
```

### Scenario 2: Metric Collection with EnumMap

```java
public enum MetricType {
    REQUEST_COUNT, ERROR_COUNT, RESPONSE_TIME, ACTIVE_CONNECTIONS
}

public class MetricsCollector {
    private final EnumMap<MetricType, AtomicLong> metrics = new EnumMap<>(MetricType.class);
    
    {
        for (MetricType type : MetricType.values()) {
            metrics.put(type, new AtomicLong(0));
        }
    }
    
    public void record(MetricType type, long value) {
        metrics.get(type).addAndGet(value);
    }
    
    public long get(MetricType type) {
        return metrics.get(type).get();
    }
}
```

---

## Common Mistakes

| Mistake | Why It's Bad | Fix |
|---------|-------------|-----|
| Using `HashMap<Day, String>` | Wastes memory, slower lookups | Use `EnumMap<Day, String>` |
| Using `HashSet<Role>` | No bit-vector optimization | Use `EnumSet<Role>` |
| Enums with mutable fields | Thread-safety nightmare | Keep enum fields `final` |
| Enum constructor with side effects | Enums are singletons — constructor runs at class load | Keep constructors pure |
| Forgetting enum is a class | Can't extend classes, limited inheritance | Use composition if needed |
