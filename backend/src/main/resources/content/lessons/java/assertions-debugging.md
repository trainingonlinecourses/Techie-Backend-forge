---
title: Assertions and Debugging — Catching Bugs at the Source
summary: Programming-by-contract with assert, when assertions are disabled, assert vs validation, jdb basics, logging diagnostics, and how organizations use assertions as executable documentation.
order: 48
minutes: 16
topics: [assert, assertions, assertions-disabled, debugging, jdb, programming-by-contract, invariant-checking]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/exceptions/assert.html
  - https://docs.oracle.com/javase/tutorial/essential/environment/sysprop.html
---

# Assertions and Debugging — Catching Bugs at the Source

## The concept

An **assertion** is a statement that declares something you believe to be true at that point in the code. If it is false, the program is in an inconsistent state — a bug.

```java
public Order processOrder(OrderRequest request) {
    Order order = createOrder(request);
    assert order != null : "createOrder returned null";
    assert order.total().signum() > 0 : "Order total must be positive: " + order.total();

    validateOrder(order);
    assert order.isValid() : "Order failed validation but no exception thrown";

    return order;
}
```

If the assertion fails, an `AssertionError` is thrown — a **programming error**, not a recoverable exception.

**Critical distinction:** assertions are for *programming errors* (bugs in your code), not for *user input validation* (bad data from the outside world). Validation catches bad input; assertions catch internal inconsistencies.

## Assertions are disabled by default

Java assertions are **off** unless you explicitly enable them with `-ea` (enable assertions):

```bash
# Assertions are ignored
java -jar app.jar

# Assertions are active
java -ea -jar app.jar

# Enable only for a specific package
java -ea:com.backendforge.academy -jar app.jar
```

This means assertions have **zero cost in production** — the JVM skips them entirely. They are a development and testing tool, not a runtime guard.

**The implication:** never put logic with side effects inside an assertion:

```java
// WRONG: the counter increment is skipped when assertions are off
assert processCounter.increment() == 1 : "Should be first";

// RIGHT: the counter works regardless
processCounter.increment();
assert processCounter.getCount() == 1 : "Should be first";
```

## Assertions vs exceptions vs validation

| Mechanism | Purpose | Runs in production? | Example |
|---|---|---|---|
| `assert` | Internal invariant | ❌ (disabled by default) | `assert list != null` |
| Exception | Recoverable error | ✅ | `throw new InsufficientFundsException()` |
| `@Valid` / `@NotNull` | User input validation | ✅ | `@NotNull String email` |
| `Preconditions.checkArgument` | Caller contract | ✅ | `checkArgument(amount > 0)` |

**In organizations:** assertions are used during unit tests and development environments to catch logic bugs early. Production code relies on exceptions and validation.

## How we use it in organizations

### Scenario 1: assertions for method preconditions and postconditions

```java
public class Money {
    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        // Precondition: caller must provide valid data
        assert amount != null : "amount must not be null";
        assert currency != null : "currency must not be null";
        assert amount.scale() <= currency.getDefaultFractionDigits()
            : "Scale exceeds currency precision";

        this.amount = amount;
        this.currency = currency;

        // Postcondition: object is in valid state
        assert this.amount.scale() <= this.currency.getDefaultFractionDigits()
            : "Internal scale error";
    }

    public Money add(Money other) {
        assert this.currency.equals(other.currency) : "Currency mismatch";
        return new Money(this.amount.add(other.amount), this.currency);
    }
}
```

### Scenario 2: assertions for algorithm correctness

```java
public class BinarySearch {

    public static int search(int[] sorted, int target) {
        assert sorted != null && isSorted(sorted) : "Array must be sorted";

        int low = 0, high = sorted.length - 1;
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (sorted[mid] == target) return mid;
            if (sorted[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;

        // Postcondition: result is valid
        // (assertion above, simplified for readability)
    }

    private static boolean isSorted(int[] arr) {
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] < arr[i - 1]) return false;
        }
        return true;
    }
}
```

### Scenario 3: debugging with logging and diagnostics

When assertions are off in production, structured logging replaces them:

```java
@Component
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order processOrder(OrderRequest request) {
        log.debug("Processing order for customer={}", request.customerId());

        Order order = createOrder(request);

        if (order == null) {
            log.error("createOrder returned null for request={}", request);
            throw new IllegalStateException("Order creation failed");
        }

        if (order.total().signum() <= 0) {
            log.error("Invalid order total: {} for order={}", order.total(), order.id());
            throw new IllegalArgumentException("Order total must be positive");
        }

        log.debug("Order created: id={}, total={}", order.id(), order.total());
        return order;
    }
}
```

## JVM debugging tools

| Tool | Purpose |
|---|---|
| `jdb` | Command-line debugger (breakpoints, stepping, variable inspection) |
| `jstack` | Thread dumps — find deadlocks and blocked threads |
| `jmap` | Heap dumps — find memory leaks |
| `jstat` | JVM statistics — GC activity, memory usage |
| `jcmd` | Unified diagnostic command interface |
| VisualVM / JProfiler | GUI profiling — CPU, memory, threads |

```bash
# Thread dump for a running Java process
jstack <pid>

# Heap dump
jmap -dump:live,format=b,file=heap.hprof <pid>

# GC statistics
jstat -gcutil <pid> 1000 10
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Putting validation logic in `assert` | Skipped in production — security holes |
| Side effects inside assert | Silent behavior change when assertions are off |
| Using assertions for input validation | Users get `AssertionError` instead of a proper message |
| Leaving `-ea` on in production | Slight performance cost, confusing `AssertionError` in logs |
| Ignoring assertion failures in tests | Tests pass but logic is broken |
