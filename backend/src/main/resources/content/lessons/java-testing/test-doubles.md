---
title: Test Doubles — Fakes, Stubs, Mocks & Spies
summary: The five kinds of test double from the classic taxonomy — and the discipline of choosing fakes over mocks at the architecture boundary.
order: 5
minutes: 14
topics: [test doubles, fakes, stubs, mocks, spies, test taxonomy]
docs:
  - https://martinfowler.com/bliki/TestDouble.html
  - https://xunitpatterns.com/Test%20Double.html
---

# Test Doubles — Fakes, Stubs, Mocks & Spies

## The taxonomy (Fowler / Meszaros)

"Mock" is a catch-all word — but the five precise kinds of double behave differently:

| Double | What it is | Example | Verify behavior? |
|---|---|---|---|
| **Dummy** | passed around, never used | a required constructor arg | no |
| **Fake** | a working lightweight implementation | in-memory repository | no |
| **Stub** | returns canned answers | `when(repo.find(1)).thenReturn(o)` | no |
| **Mock** | pre-programmed + expects calls | `verify(repo).save(o)` | yes |
| **Spy** | real object, wrapped to observe/call | `spy(realService)` | yes |

The practical split: **dummies/fakes** replace *dependencies*; **stubs/mocks/spies** are *Mockito's* vocabulary for controlling behavior.

## The fake: the unsung hero

A **fake** is a real implementation — usually in-memory — that behaves like the real thing. It's the best double for repositories and clocks:

```java
class InMemoryOrderRepository implements OrderRepository {
    private final Map<Long, Order> store = new HashMap<>();
    private long seq = 1;
    public Order save(Order o) { o.id(seq++); store.put(o.id(), o); return o; }
    public Optional<Order> findById(long id) { return Optional.ofNullable(store.get(id)); }
    public List<Order> findAll() { return List.copyOf(store.values()); }
}

// Test: no mocking, real behavior, milliseconds fast:
OrderService service = new OrderService(new InMemoryOrderRepository());
```

Fakes shine because they **don't pin implementation** — refactor `findAll()` internally and the fake-based test still passes. When the fake gets complicated (sorting, filtering, transactions), that's the signal the real collaborator is doing too much.

## Mockito: stub or verify?

The Mockito distinction matters more than the taxonomy:

- **Stubbing** (`when(x).thenReturn(y)`) answers the question "what does the unit need to proceed?" — it sets up *inputs*.
- **Verifying** (`verify(x)`) asks "did the unit do the right thing?" — it asserts on *outputs* (side effects).

The trap: treating stubs as verification. `when(repo.save(o)).thenReturn(o)` doesn't assert the save happened — only `verify(repo).save(o)` does. Teams that only stub write tests that pass while the real system silently skips work.

## Choosing: the architecture-boundary rule

The honest rule for *which* double:

1. **Prefer fakes** for heavy, stateful collaborators (repositories, caches) — real behavior, no implementation pinning. Write a tiny fake per test class or share one.
2. **Prefer stubs** for I/O you can't fake cheaply (HTTP clients, message brokers) — you don't want the test to really call Stripe.
3. **Verify sparingly** — only for side effects that are *business rules* (charge the payment, publish the event), never for incidental call sequences.
4. **Spies only when** one method of a real object needs overriding — usually a refactor smell.

## The double that bites: partial fakes

A fake that only implements *some* methods throws `UnsupportedOperationException` on the rest — which is exactly right: it tells you the test is using an unfaked seam. Don't "just add a stub" — decide: this collaborator belongs at the boundary, so give it a real fake.

## Dummies and nulls

The Java null problem: constructors force arguments. A **dummy** is `null` or an empty object passed only to satisfy the signature. Two tools keep dummies honest:

```java
assertDoesNotThrow(() -> service.create(order, DUMMY_CLOCK));   // clock unused in this path

// Or make the dependency optional and pass null deliberately — with a comment:
service.create(order, null);  // null audit logger: not used on the happy path
```

## When integration tests replace doubles entirely

The pyramid's message: the *integration* layer (real Postgres via Testcontainers, real Spring context) is where the doubles' blind spots (SQL dialect, transaction semantics, serialization) get caught. Doubles make the **logic** fast and isolated; integration tests make the **boundary** true. Both, in that order.

## Key takeaways

- Dummy / Fake / Stub / Mock / Spy — know the difference; "mock" alone is imprecise.
- Fakes (in-memory implementations) beat mocks for stateful collaborators — real behavior, no pinning.
- Stubs set up inputs; verification asserts outputs — stubbing is not verifying.
- Doubles for the fast logic layer; Testcontainers/integration tests for the real boundary.

Official docs: [TestDouble (Fowler)](https://martinfowler.com/bliki/TestDouble.html) · [xUnit Patterns](https://xunitpatterns.com/Test%20Double.html)
