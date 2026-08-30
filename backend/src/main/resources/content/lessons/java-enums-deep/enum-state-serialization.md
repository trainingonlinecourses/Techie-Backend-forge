---
title: Enum State Machines & Serialization — Real Patterns
summary: Building finite state machines, serializing enums safely with custom readResolve, and using EnumMap for compact multi-state transition tables.
order: 3
minutes: 20
topics: [enum-state-machine, enum-serialization, read-resolve, transition-table, compact-enum]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/enum/index.html
---

## The Concept, From Zero

Finite state machines (FSMs) are everywhere in software: order processing (created → paid → shipped → delivered), TCP connections (SYN → ESTABLISHED → FIN), workflow engines, game AI. Enums are the **perfect tool** for building FSMs because:

1. Each state is a named constant (no magic strings)
2. Each state can have its own behavior (abstract methods)
3. The compiler enforces exhaustiveness (you handle all states)
4. `EnumMap` gives you O(1) transition lookups

---

## Building a State Machine

### Step 1: Define States with Transitions

```java
public enum PaymentState {
    INITIATED {
        public PaymentState onEvent(PaymentEvent event) {
            switch (event) {
                case PAYMENT_RECEIVED: return PROCESSING;
                case TIMEOUT: return EXPIRED;
                case CANCELLED: return CANCELLED;
                default: throw new IllegalStateException("Invalid event " + event + " in " + this);
            }
        }
    },
    PROCESSING {
        public PaymentState onEvent(PaymentEvent event) {
            switch (event) {
                case GATEWAY_CONFIRMED: return COMPLETED;
                case GATEWAY_REJECTED: return FAILED;
                case RETRY: return PROCESSING;
                default: throw new IllegalStateException("Invalid event " + event + " in " + this);
            }
        }
    },
    COMPLETED {
        public PaymentState onEvent(PaymentEvent event) {
            switch (event) {
                case REFUND_REQUESTED: return REFUNDED;
                default: throw new IllegalStateException("Invalid event " + event + " in " + this);
            }
        }
    },
    FAILED {
        public PaymentState onEvent(PaymentEvent event) {
            switch (event) {
                case RETRY: return INITIATED;
                default: throw new IllegalStateException("Invalid event " + event + " in " + this);
            }
        }
    },
    EXPIRED, CANCELLED, REFUNDED {
        public PaymentState onEvent(PaymentEvent event) {
            throw new IllegalStateException("Terminal state " + this + " cannot transition");
        }
    };
    
    public abstract PaymentState onEvent(PaymentEvent event);
}

public enum PaymentEvent {
    PAYMENT_RECEIVED, GATEWAY_CONFIRMED, GATEWAY_REJECTED,
    TIMEOUT, CANCELLED, RETRY, REFUND_REQUESTED
}
```

### Step 2: Transition Table with EnumMap

```java
public class PaymentStateMachine {
    private PaymentState currentState = PaymentState.INITIATED;
    private final List<PaymentState> history = new ArrayList<>();
    
    // Transition table — maps (state, event) → next state
    private static final EnumMap<PaymentState, EnumMap<PaymentEvent, PaymentState>> TRANSITIONS = new EnumMap<>(PaymentState.class);
    
    static {
        // Initialize transitions using the enum's own onEvent method
        for (PaymentState state : PaymentState.values()) {
            EnumMap<PaymentEvent, PaymentState> stateTransitions = new EnumMap<>(PaymentEvent.class);
            for (PaymentEvent event : PaymentEvent.values()) {
                try {
                    PaymentState next = state.onEvent(event);
                    if (next != state) {  // Only record actual transitions
                        stateTransitions.put(event, next);
                    }
                } catch (IllegalStateException e) {
                    // Invalid transition — skip
                }
            }
            TRANSITIONS.put(state, stateTransitions);
        }
    }
    
    public PaymentState fireEvent(PaymentEvent event) {
        PaymentState nextState = currentState.onEvent(event);
        history.add(currentState);
        currentState = nextState;
        return nextState;
    }
    
    public boolean canFire(PaymentEvent event) {
        try {
            currentState.onEvent(event);
            return true;
        } catch (IllegalStateException e) {
            return false;
        }
    }
    
    public List<PaymentState> getHistory() { return Collections.unmodifiableList(history); }
}

// Usage:
PaymentStateMachine sm = new PaymentStateMachine();
sm.fireEvent(PaymentEvent.PAYMENT_RECEIVED);  // INITIATED → PROCESSING
sm.fireEvent(PaymentEvent.GATEWAY_CONFIRMED); // PROCESSING → COMPLETED
sm.fireEvent(PaymentEvent.REFUND_REQUESTED);  // COMPLETED → REFUNDED
System.out.println(sm.getHistory());  // [INITIATED, PROCESSING, COMPLETED]
```

---

## Enum Serialization — The Subtle Trap

### The Problem

Enums are singletons — there's only ONE `PaymentState.PROCESSING` instance. But Java serialization creates new instances by default. If you serialize and deserialize an enum, you might get a **different** object:

```java
// Serialize
PaymentState state = PaymentState.PROCESSING;
ObjectOutputStream out = new ObjectOutputStream(new FileOutputStream("state.ser"));
out.writeObject(state);

// Deserialize — might this be a different object?
ObjectInputStream in = new ObjectInputStream(new FileInputStream("state.ser"));
PaymentState restored = (PaymentState) in.readObject();

// This SHOULD be true (and is, thanks to special enum serialization)
System.out.println(state == restored);  // true
```

### Why It Works (and When It Doesn't)

Java's serialization has **special enum handling**: instead of creating a new instance, it returns the existing constant by name. So `PaymentState.PROCESSING` serializes as "PROCESSING" and deserializes by looking up `PaymentState.valueOf("PROCESSING")`.

**BUT** — if you're implementing `Serializable` on a class that CONTAINS an enum field, and you override `readResolve()`, make sure you don't break the enum lookup:

```java
// WRONG: Custom serialization that breaks enum constants
public class Order implements Serializable {
    private PaymentState state;
    
    private Object readResolve() throws ObjectStreamException {
        // This might create a new PaymentState instance — BAD!
        return new Order();  // ❌ Enum field might not be re-resolved
    }
}

// RIGHT: Let Java handle enum fields automatically
public class Order implements Serializable {
    private PaymentState state;  // Java serialization handles enums correctly
    // No readResolve needed for enum fields — they resolve by name automatically
}
```

### Custom Serialization with Enums

```java
public enum ConfigMode {
    DEVELOPMENT("dev", true),
    STAGING("staging", false),
    PRODUCTION("prod", false);
    
    private final String label;
    private final boolean allowDebug;
    
    ConfigMode(String label, boolean allowDebug) {
        this.label = label;
        this.allowDebug = allowDebug;
    }
    
    // readResolve ensures deserialized objects are the actual constants
    // This is the DEFAULT behavior for enums, but you can add it explicitly:
    private Object readResolve() throws java.io.ObjectStreamException {
        return valueOf(this.name());  // Return the singleton constant
    }
    
    // writeReplace can transform the enum before serialization
    private Object writeReplace() throws java.io.ObjectStreamException {
        // Serialize as just the name string (saves space)
        return this.name();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Workflow Engine

```java
public enum TicketState {
    OPEN {
        public TicketState transition(TicketAction action) {
            return action == TicketAction.ASSIGN ? IN_PROGRESS : this;
        }
    },
    IN_PROGRESS {
        public TicketState transition(TicketAction action) {
            return action == TicketAction.RESOLVE ? RESOLVED
                 : action == TicketAction.REASSIGN ? IN_PROGRESS
                 : action == TicketAction.CLOSE ? CLOSED
                 : this;
        }
    },
    RESOLVED {
        public TicketState transition(TicketAction action) {
            return action == TicketAction.REOPEN ? OPEN
                 : action == TicketAction.CLOSE ? CLOSED
                 : this;
        }
    },
    CLOSED { /* Terminal */ };
    
    public abstract TicketState transition(TicketAction action);
}
```

### Scenario 2: Game AI States

```java
public enum AIState {
    IDLE {
        public AIState update(GameWorld world) {
            return world.detectsEnemy() ? COMBAT : this;
        }
    },
    PATROL {
        public AIState update(GameWorld world) {
            if (world.detectsEnemy()) return COMBAT;
            if (world.reachedPatrolPoint()) return IDLE;
            return this;
        }
    },
    COMBAT {
        public AIState update(GameWorld world) {
            if (!world.detectsEnemy()) return PATROL;
            if (world.healthBelow(20)) return FLEE;
            return this;
        }
    },
    FLEE {
        public AIState update(GameWorld world) {
            if (!world.isEnemyNearby()) return PATROL;
            return this;
        }
    };
    
    public abstract AIState update(GameWorld world);
}
```

---

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Mutable fields in enums | Thread-safety bugs, singleton corruption | All fields must be `final` |
| Enum with no constants | Compiles but nonsensical | Don't do this |
| Forgetting terminal states | State machine can't stop | Make sure some states have no outgoing transitions |
| `ordinal()` for storage | Breaks if enum order changes | Use `name()` or explicit ID field |
| Enum in switch without all cases | Might miss new constants | Add `default` case or use abstract method pattern |
