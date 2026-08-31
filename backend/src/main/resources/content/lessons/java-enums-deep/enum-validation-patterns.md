---
title: Enum Validation & State Machines — Beyond Simple Constants
summary: Using enums for input validation, state machines, and strategy dispatch — patterns that eliminate null checks, reduce if-else chains, and make invalid states unrepresentable.
order: 4
minutes: 20
topics: [enum-validation, state-machine, strategy-dispatch, null-object, type-safety]
docs:
  - https://www.oracle.com/java/technologies/javase/tutorial/java/javaOO/enum.html
---

## The Concept, From Zero

Enums in Java are not just named constants. Each enum constant is a full class instance with fields, methods, and constructors. This makes enums perfect for patterns that eliminate entire categories of bugs:

- **Validation**: Reject invalid input at parse time
- **State machines**: Model transitions with compile-time safety
- **Strategy dispatch**: Replace if-else chains with polymorphism
- **Null object**: Replace null checks with "do nothing" enum values

## The Code

### Pattern 1: Input Validation
```java
public enum LogLevel {
    DEBUG(0), INFO(1), WARN(2), ERROR(3), FATAL(4);

    private final int severity;

    LogLevel(int severity) { this.severity = severity; }

    // Parse with default — no null possible
    public static LogLevel fromString(String name) {
        try {
            return LogLevel.valueOf(name.toUpperCase());
        } catch (IllegalArgumentException e) {
            return INFO;  // Safe default
        }
    }

    public boolean isAtLeast(LogLevel level) {
        return this.severity >= level.severity;
    }
}

// Usage: no null checks needed
LogLevel level = LogLevel.fromString(userInput);
if (level.isAtLeast(LogLevel.WARN)) {
    alertService.send(level.name() + ": " + message);
}
```

### Pattern 2: State Machine
```java
public enum OrderState {
    PENDING {
        public OrderState next() { return CONFIRMED; }
        public boolean canCancel() { return true; }
    },
    CONFIRMED {
        public OrderState next() { return SHIPPED; }
        public boolean canCancel() { return true; }
    },
    SHIPPED {
        public OrderState next() { return DELIVERED; }
        public boolean canCancel() { return false; }
    },
    DELIVERED {
        public OrderState next() { return this; }  // Terminal
        public boolean canCancel() { return false; }
    };

    public abstract OrderState next();
    public abstract boolean canCancel();

    public OrderState cancel() {
        if (!canCancel()) {
            throw new IllegalStateException("Cannot cancel in " + this);
        }
        return CANCELLED;
    }
}

// Usage: compiler ensures all states handled
OrderState state = OrderState.PENDING;
state = state.next();   // CONFIRMED
state = state.next();   // SHIPPED
state.canCancel();      // false — no accidental cancellation
```

### Pattern 3: Strategy Dispatch
```java
public enum PaymentMethod {
    CREDIT_CARD {
        public void process(BigDecimal amount) {
            stripeService.charge(amount);
        }
    },
    PAYPAL {
        public void process(BigDecimal amount) {
            paypalService.sendPayment(amount);
        }
    },
    BANK_TRANSFER {
        public void process(BigDecimal amount) {
            bankService.wireTransfer(amount);
        }
    };

    public abstract void process(BigDecimal amount);
}

// Usage: no if-else chain
PaymentMethod method = PaymentMethod.valueOf(order.getPaymentType());
method.process(order.getTotal());
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `DEBUG(0)` | Enum constant with field | Each constant carries metadata |
| `fromString` with try/catch | Safe parsing | Returns default instead of null |
| `isAtLeast` | Comparison by severity | Eliminates if-else chains for log filtering |
| `abstract OrderState next()` | Polymorphic transition | Each state defines its own valid transitions |
| `abstract void process` | Strategy pattern | Payment method dispatched by enum type |

## Key Takeaways

1. **Enums replace null checks** — safe defaults eliminate NPEs
2. **State machines** become compile-time safe — invalid transitions throw
3. **Strategy pattern** — replace if-else with polymorphism
4. **EnumSet for flags** — O(1) union, intersection, and subset checks
5. **Each constant is a class** — with fields, methods, and constructors
