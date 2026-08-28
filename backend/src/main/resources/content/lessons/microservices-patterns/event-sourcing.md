---
title: Event Sourcing — The Complete Guide
summary: The event log as the source of truth — commands become facts, state is a projection, and every question is answerable from history. Beginner-friendly deep dive with line-by-line code walkthroughs.
order: 3
minutes: 25
topics: [event sourcing, event log, projections, replay, audit trail, CQRS, snapshots, event store, domain events]
docs:
  - https://martinfowler.com/eaaDev/EventSourcing.html
  - https://microservices.io/patterns/data/event-sourcing.html
---

# Event Sourcing — The Complete Guide

## What is Event Sourcing? (From Zero)

Imagine you're keeping a bank ledger. You don't just write "current balance: $500." Instead, you write every single transaction:

```
Jan 1: Deposit $1000
Jan 5: Withdraw $200
Jan 10: Deposit $300
Jan 15: Withdraw $100
```

Now, to know the current balance, you **add up all the entries**. That's event sourcing in a nutshell — instead of storing the *current state*, you store **every fact that ever happened**, and the current state is calculated by replaying those facts.

### Traditional vs Event Sourcing

| Traditional (State-Based) | Event Sourcing |
|---|---|
| Stores `Account(balance=1000)` | Stores `[Deposited(1000), Withdrawn(200), Deposited(300), Withdrawn(100)]` |
| A bug overwrites truth permanently | A bug is just a bad projection — fix and replay |
| "What happened on Jan 5?" → we don't know | "What happened on Jan 5?" → it's in the log |
| Simple to build | More complex, but powerful for audit-heavy domains |

**When to use event sourcing:** Banking, healthcare records, collaborative editing, supply chain, legal/compliance systems — anywhere history IS the product.

**When NOT to use it:** Simple CRUD apps, blogs, small internal tools — the complexity isn't worth it.

## The Core Concepts

### 1. Events vs Commands

This is the most important distinction:

- **Command**: "I want to withdraw $200" — a *request* that can be rejected
- **Event**: "Bob withdrew $200 at 3:15 PM" — a *fact* that already happened, cannot be rejected

```
Command → validates → Event (if valid)
```

### 2. The Event Store

The event store is an **append-only log** — you can write events but never modify or delete them. Think of it like a write-ahead log that becomes your database.

### 3. Projections (Read Models)

Since the event log is optimized for writing, you build **projections** — read-optimized views derived from the events. This is where CQRS comes in: writes go to the event store, reads come from projections.

### 4. Snapshots

After 10,000 events, replaying all of them to get the current state is slow. **Snapshots** save the state periodically so you only replay events since the last snapshot.

---

## The Code — Line by Line

### Step 1: Define the Event Types

Events are immutable objects. They represent facts — things that already happened and can never be undone.

```java
// Every event is a fact — it happened, it can't be "un-happened"
// Using Java records (Java 16+) for immutability by default:
public record AccountOpened(         // The event type name — descriptive, past-tense
    String accountId,                // Which aggregate this happened to
    String ownerName,                // Payload — who opened the account
    Instant occurredAt               // When it happened — critical for ordering
) {}

public record MoneyDeposited(        // Past tense — this already happened
    String accountId,                // Same aggregate ID
    BigDecimal amount,               // How much was deposited
    Instant occurredAt               // When
) {}

public record MoneyWithdrawn(        // Another fact
    String accountId,
    BigDecimal amount,
    Instant occurredAt
) {}
```

**Line-by-line explained:**
- `public record AccountOpened(...)` — We use `record` because events must be immutable. Once created, nothing can change a fact.
- `String accountId` — Every event knows which "thing" (aggregate) it belongs to. This is how we group events per account.
- `Instant occurredAt` — When this happened. Critical for ordering events correctly and for temporal queries ("what was the balance on March 3?").

### Step 2: The Aggregate (State as a Fold)

The aggregate is the domain object. In event sourcing, it has two key methods: `apply()` to build state from events, and command methods to validate and emit new events.

```java
public class Account {
    private String id;
    private String owner;
    private BigDecimal balance = BigDecimal.ZERO;    // Starting state: empty
    private final List<DomainEvent> uncommittedEvents = new ArrayList<>();

    // === COMMAND METHOD: validates, then emits an event ===
    public void deposit(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Deposit must be positive");  // Validation FIRST
        }
        // Emit the event — don't change balance directly!
        applyEvent(new MoneyDeposited(this.id, amount, Instant.now()));
    }

    public void withdraw(BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Withdrawal must be positive");
        }
        if (balance.compareTo(amount) < 0) {
            throw new IllegalStateException("Insufficient funds");  // Business rule enforcement
        }
        applyEvent(new MoneyWithdrawn(this.id, amount, Instant.now()));
    }

    // === EVENT APPLICATION: pure function, no validation ===
    private void applyEvent(DomainEvent event) {
        if (event instanceof MoneyDeposited e) {         // Java 16 pattern matching
            this.balance = this.balance.add(e.amount());  // State changes HERE
        } else if (event instanceof MoneyWithdrawn e) {
            this.balance = this.balance.subtract(e.amount());
        }
        this.uncommittedEvents.add(event);               // Track new events for persistence
    }

    // === REBUILD STATE FROM HISTORY ===
    public static Account reconstitute(String accountId, List<DomainEvent> history) {
        Account account = new Account();
        account.id = accountId;
        history.forEach(account::applyEvent);   // Fold: apply each event in order
        return account;                         // Current state = result of the fold
    }
}
```

**Line-by-line explained:**
- `private final List<DomainEvent> uncommittedEvents` — New events accumulate here until saved. After saving, this list is cleared.
- `deposit()` is the COMMAND: it validates first ("is this legal?"), then emits an event ("this happened"). The command method never changes `balance` directly.
- `applyEvent()` is the EVENT HANDLER: it's a pure function that changes state. No validation, no I/O, no side effects. This makes replay safe.
- `reconstitute()` is the FOLD: start with empty state, apply events one by one. This is how you rebuild state from the event log.

### Step 3: The Event Store (Persistence)

```java
@Repository
public class EventStore {
    private final JdbcTemplate jdbc;   // Using JDBC for simplicity; could be JPA, MongoDB, etc.

    // === WRITE: append events atomically ===
    @Transactional
    public void append(String aggregateId, List<DomainEvent> events) {
        int version = getCurrentVersion(aggregateId);  // Get current position in the log
        for (DomainEvent event : events) {
            version++;                                 // Sequential version per aggregate
            jdbc.update(
                "INSERT INTO events (aggregate_id, version, event_type, payload, occurred_at) " +
                "VALUES (?, ?, ?, ?, ?)",
                aggregateId,                            // Which aggregate
                version,                                // Position in the log (optimistic lock)
                event.getClass().getSimpleName(),       // "MoneyDeposited" — for deserialization
                objectMapper.writeValueAsString(event),  // JSON payload
                event.occurredAt()                      // When it happened
            );
        }
    }

    // === READ: load all events for an aggregate ===
    public List<DomainEvent> loadEvents(String aggregateId) {
        return jdbc.query(
            "SELECT event_type, payload FROM events WHERE aggregate_id = ? ORDER BY version",
            (rs, i) -> deserialize(rs.getString("event_type"), rs.getString("payload"))
        );
    }

    // === REBUILD: fold events into current state ===
    public Account loadAccount(String accountId) {
        List<DomainEvent> history = loadEvents(accountId);
        return Account.reconstitute(accountId, history);   // Rebuild from scratch
    }
}
```

**Line-by-line explained:**
- `append()` is append-only — we never UPDATE or DELETE rows. The version column acts as an optimistic lock (two concurrent writes can't overwrite each other).
- `getCurrentVersion()` checks the latest version for this aggregate — prevents version conflicts.
- `loadEvents()` reads all events in order (ORDER BY version) — this is the replay.
- `loadAccount()` folds events into current state — the "magic" of event sourcing.

### Step 4: Snapshots (Performance Optimization)

```java
public class AccountSnapshotService {
    private static final int SNAPSHOT_INTERVAL = 100;   // Snapshot every 100 events

    public Account loadWithSnapshot(String accountId) {
        // 1. Find latest snapshot (if any)
        AccountSnapshot snapshot = snapshotStore.findLatest(accountId);

        // 2. Load events AFTER the snapshot
        List<DomainEvent> events;
        if (snapshot != null) {
            events = eventStore.loadEventsAfter(accountId, snapshot.version());
        } else {
            events = eventStore.loadEvents(accountId);   // No snapshot — replay everything
        }

        // 3. Rebuild from snapshot + remaining events
        Account account = snapshot != null
            ? snapshot.toAccount()                       // Rebuild from snapshot state
            : new Account();                             // Start fresh

        events.forEach(account::applyEvent);             // Apply remaining events
        return account;
    }
}
```

**Line-by-line explained:**
- We check for a snapshot first — this saves us from replaying thousands of events.
- `loadEventsAfter()` only loads events after the snapshot version — much faster.
- We rebuild from the snapshot state, then apply only the newer events.

---

## Real-World Scenarios

### Scenario 1: Banking System (Audit Trail)

A bank **must** show regulators every transaction that ever happened. With event sourcing:

```
Audit query: "Show all activity for account #12345 in 2024"
→ SELECT * FROM events WHERE aggregate_id = '12345' AND occurred_at BETWEEN '2024-01-01' AND '2024-12-31'
→ Every deposit, withdrawal, transfer — immutable, ordered, complete
```

With traditional storage, you'd need a separate audit log that somehow stays in sync. Event sourcing makes the audit trail free.

### Scenario 2: Bug in a Projection (Replay)

A dashboard shows wrong data because of a calculation bug in the projection code:

```java
// BUG: was multiplying instead of adding
public void on(MoneyDeposited e) {
    dashboard.total = dashboard.total.multiply(e.amount());  // WRONG
}

// FIX: correct the projection code
public void on(MoneyDeposited e) {
    dashboard.total = dashboard.total.add(e.amount());       // CORRECT
}

// Replay: rebuild the dashboard from events — bug is gone
```

With traditional storage, the wrong data is already written and you'd need a data fix script. With event sourcing, fix the code, replay, done.

### Scenario 3: Temporal Query

Customer service asks: "What was John's balance on March 3rd?"

```java
Account account = accountStore.loadUntil("john-123", Instant.parse("2024-03-03T23:59:59Z"));
// Replay only events up to March 3 — get exact historical state
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Mutable events | Changing a fact breaks replay integrity — events must be immutable | Use `record` or final fields with no setters |
| Side effects in `apply()` | Can't safely replay if apply() sends emails or writes to other services | Keep apply() pure: state changes only |
| No version column | Two concurrent writes overwrite each other silently | Always include per-aggregate version for optimistic locking |
| Forgetting snapshots | Replaying 1M events on every read kills performance | Snapshot every N events (100-1000) |
| Storing events AND state separately | Gets out of sync — one source of truth, not two | Events ARE the truth; state is derived |
| Event schema changes without versioning | Old events can't be deserialized after code changes | Version your events (`AccountOpenedV2`) and upcast |

---

## Event Sourcing vs Related Patterns

| Pattern | Source of Truth | What it adds |
|---|---|---|
| **Event Sourcing** | Event log | All history, replay, temporal queries |
| **CQRS** | Separate read/write stores | Read optimization (can exist without ES) |
| **Outbox** | Business DB + event mirror | Reliable event publishing (can exist without ES) |
| **Audit Log** | Business DB + separate log | Compliance trail (weaker than ES) |

Event sourcing includes CQRS naturally (you need projections), and typically uses the outbox pattern for publishing. But they're independent choices.

---

## Key Takeaways

- **Events are facts** (past tense, immutable). **Commands are requests** (can be rejected).
- **State is a projection** — fold the event log to get current state.
- **apply() must be pure** — no I/O, no side effects — so replay is safe.
- **Snapshots** prevent replaying thousands of events on every read.
- **It's a specialty tool** — use it where history is the product (banking, audit, compliance), not everywhere.
- **The outbox hybrid** gives most of the benefits without betting the system on event-derived state.

Official docs: [Event Sourcing (Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html) · [Event Sourcing (microservices.io)](https://microservices.io/patterns/data/event-sourcing.html)
