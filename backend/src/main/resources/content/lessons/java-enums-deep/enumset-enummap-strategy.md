---
title: EnumSet, EnumMap & Strategy Pattern — Enums Beyond Basics
summary: Using EnumSet for bit-vector-fast set operations, EnumMap for enum-keyed performance, and implementing the Strategy pattern with enums that have abstract methods.
order: 4
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


**What this code does — step by step:**

1. Empty set
2. Full set (all constants)
3. Single value
4. Multiple values
5. Range (inclusive start, exclusive end)
6. Result: {READ, WRITE, EXECUTE}
7. Complement (everything NOT in the set)
8. Result: {EXECUTE, DELETE, ADMIN}

The same code, clean:

```java
public enum Permission {
    READ, WRITE, EXECUTE, DELETE, ADMIN
}

EnumSet<Permission> none = EnumSet.noneOf(Permission.class);

EnumSet<Permission> all = EnumSet.allOf(Permission.class);

EnumSet<Permission> read = EnumSet.of(Permission.READ);

EnumSet<Permission> readWrite = EnumSet.of(Permission.READ, Permission.WRITE);

EnumSet<Permission> basic = EnumSet.range(Permission.READ, Permission.EXECUTE);

EnumSet<Permission> restricted = EnumSet.complementOf(readWrite);
```

### Set Operations


**What this code does — step by step:**

1. Union
2. Result: {READ, WRITE, DELETE, ADMIN}
3. Intersection
4. Result: {READ, WRITE}
5. Difference
6. Result: {DELETE, ADMIN}
7. Membership check — O(1), uses bit position
8. `boolean canDelete = userPerms.contains(Permission.DELETE);` — false

The same code, clean:

```java
EnumSet<Permission> userPerms = EnumSet.of(Permission.READ, Permission.WRITE);
EnumSet<Permission> adminPerms = EnumSet.of(Permission.READ, Permission.WRITE, Permission.DELETE, Permission.ADMIN);

EnumSet<Permission> combined = EnumSet.copyOf(userPerms);
combined.addAll(adminPerms);

EnumSet<Permission> common = EnumSet.copyOf(userPerms);
common.retainAll(adminPerms);

EnumSet<Permission> onlyAdmin = EnumSet.copyOf(adminPerms);
onlyAdmin.removeAll(userPerms);

boolean canDelete = userPerms.contains(Permission.DELETE);
```

### Line-by-Line Walkthrough of the Internals


**What this code does — step by step:**

1. What EnumSet looks like internally (simplified). For 64 or fewer enum constants, it uses a single long:
2. `long elements;` — Bit vector! Each bit = one enum constant
3. Adding: just set a bit
4. `elements |= (1L << e.ordinal());` — Bitwise OR — one CPU instruction!
5. Contains: just test a bit
6. `return (elements & (1L << ((Enum<?>)e).ordinal())) != 0;` — Bitwise AND
7. Size: popcount (count set bits)
8. `return Long.bitCount(elements);` — Hardware-level instruction

The same code, clean:

```java
class SmallEnumSet<E extends Enum<E>> extends AbstractEnumSet<E> {
    long elements;

    public boolean add(E e) {
        long oldElements = elements;
        elements |= (1L << e.ordinal());
        return elements != oldElements;
    }

    public boolean contains(Object e) {
        return (elements & (1L << ((Enum<?>)e).ordinal())) != 0;
    }

    public int size() {
        return Long.bitCount(elements);
    }
}
```

**This is why EnumSet is so fast** — no hashing, no buckets, no collision chains. A single bitwise operation does the work.

---

## EnumMap — The Fastest Map for Enum Keys


**What this code does — step by step:**

1. Create an EnumMap
2. Put values
3. Get — uses ordinal as array index, no hashing
4. `String room = meetingRooms.get(Day.WEDNESDAY);` — "Room A"
5. Iteration order follows enum declaration order (MONDAY → SUNDAY)
6. Output: MONDAY: Room A, TUESDAY: Room B, WEDNESDAY: Room A, ...

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        public enum Day {
            MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
        }

        EnumMap<Day, String> meetingRooms = new EnumMap<>(Day.class);

        meetingRooms.put(Day.MONDAY, "Room A");
        meetingRooms.put(Day.TUESDAY, "Room B");
        meetingRooms.put(Day.WEDNESDAY, "Room A");
        meetingRooms.put(Day.THURSDAY, "Room C");
        meetingRooms.put(Day.FRIDAY, "Room B");

        String room = meetingRooms.get(Day.WEDNESDAY);

        for (Map.Entry<Day, String> entry : meetingRooms.entrySet()) {
            System.out.println(entry.getKey() + ": " + entry.getValue());
        }
    }
}
```

### Why EnumMap Wins Over HashMap


**What this code does — step by step:**

1. HashMap: hash the key → find bucket → handle collisions → compare keys. EnumMap: enum.ordinal() → array[ordinal] → done
2. Memory: HashMap stores Entry objects with hash, key, value, next pointer. EnumMap stores a flat array of values (null for missing entries)
3. Benchmark: EnumMap.put() is ~3x faster than HashMap.put() for enum keys. Benchmark: EnumMap.get() is ~4x faster than HashMap.get() for enum keys

The same code, clean:

```java
```

---

## Strategy Pattern with Enums

This is where enums become truly powerful. Instead of creating separate classes for each strategy, each enum constant **IS** the strategy:


**What this code does — step by step:**

1. Without enums: you'd need an interface + 3 classes. With enums: each constant implements the abstract method
2. Each constant overrides calculateDiscount
3. `return price * 0.75;` — Average of full + half price
4. Abstract method — each constant MUST implement this
5. Convenience method for the entire list
6. Usage:
7. `double discounted = strategy.calculate(100.0);` — 80.0
8. FLAT_10: $100.00 → $90.00. PERCENT_20: $100.00 → $80.00. BUY_ONE_GET_HALF: $100.00 → $75.00

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        public enum DiscountStrategy {
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
                    return price * 0.75;
                }
            };

            public abstract double calculate(double price);

            public static void applyAll(double price) {
                for (DiscountStrategy strategy : values()) {
                    System.out.printf("%s: $%.2f → $%.2f%n", 
                        strategy.name(), price, strategy.calculate(price));
                }
            }
        }

        DiscountStrategy strategy = DiscountStrategy.PERCENT_20;
        double discounted = strategy.calculate(100.0);

        DiscountStrategy.applyAll(100.0);
    }
}
```

### State Machine with Enums

public class Main {

    public static void main(String[] args) {
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
    }
}

---

## Real-World Scenarios

### Scenario 1: Role-Based Access Control

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

### Scenario 2: Metric Collection with EnumMap

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

---

## Common Mistakes

| Mistake | Why It's Bad | Fix |
|---------|-------------|-----|
| Using `HashMap<Day, String>` | Wastes memory, slower lookups | Use `EnumMap<Day, String>` |
| Using `HashSet<Role>` | No bit-vector optimization | Use `EnumSet<Role>` |
| Enums with mutable fields | Thread-safety nightmare | Keep enum fields `final` |
| Enum constructor with side effects | Enums are singletons — constructor runs at class load | Keep constructors pure |
| Forgetting enum is a class | Can't extend classes, limited inheritance | Use composition if needed |

