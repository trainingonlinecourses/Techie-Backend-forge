---
title: Access Modifiers — Controlling Who Can See What
summary: private, default (package-private), protected, and public explained with the visibility table, why organizations lock almost everything down, and how encapsulation prevents real production incidents.
order: 72
minutes: 20
topics: [access-modifiers, encapsulation, private, protected, public, package-private]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/accesscontrol.html
---

## The Concept, From Zero

Imagine an office building. Some rooms are open to everyone (the lobby), some only for employees (offices), some only for the team that owns them (a locked lab), and some are family-only spaces. **Access modifiers** are Java's door locks on classes, fields, methods, and constructors.

Java has exactly four levels of access:

| Modifier | Same class | Same package | Subclass (other pkg) | Everywhere |
|---|---|---|---|---|
| `private` | ✅ | ❌ | ❌ | ❌ |
| *(default — no keyword)* | ✅ | ✅ | ❌ | ❌ |
| `protected` | ✅ | ✅ | ✅ | ❌ |
| `public` | ✅ | ✅ | ✅ | ✅ |

Read it as a funnel: each step down opens the door wider. The "default" level is special — you get it by writing **no modifier at all**, and it means "visible only within my own package."

## `private` — Only this class

```java
public class BankAccount {
    private BigDecimal balance = BigDecimal.ZERO;  // visible ONLY inside BankAccount

    public void deposit(BigDecimal amount) {       // public door to the outside world
        if (amount.signum() <= 0) {                // rule enforced at ONE place
            throw new IllegalArgumentException("Deposit must be positive");
        }
        this.balance = this.balance.add(amount);   // the ONLY code path that changes balance
    }

    public BigDecimal getBalance() {               // read access, no way to write directly
        return balance;
    }
}
```

Line by line:

| Line | Why it matters |
|---|---|
| `private BigDecimal balance` | Nobody outside can do `account.balance = -1000` — the compiler physically blocks it |
| `public void deposit(...)` | The single gateway through which money enters; validation lives here and nowhere else |
| `if (amount.signum() <= 0)` | Because all writes funnel through this method, one check protects every caller |
| `getBalance()` | Exposes reading without exposing writing — callers can't bypass the rules |

This is **encapsulation** in action: data + the rules that protect it live together.

## *(default)* / package-private — Team-internal

```java
class OrderRepositoryHelper {   // no 'public' → only classes in this same package can use it
    void cleanupExpired() { }
}
```

Organizations use this for "implementation details shared between neighboring classes" — e.g., helper classes used only by other classes in the same feature package. It keeps them out of the public API surface.

## `protected` — Family access

```java
public abstract class ReportGenerator {
    protected abstract List<Row> fetchData();   // subclasses MUST provide this

    public final void generate() {              // template method: fixed skeleton
        List<Row> rows = fetchData();           // calls the subclass's implementation
        render(rows);                           // ...then renders uniformly
    }

    protected void render(List<Row> rows) {     // hook subclasses MAY customize
        System.out.println("Rendering " + rows.size() + " rows");
    }
}
```

`protected` says: "subclasses anywhere may touch or override this, but random unrelated classes may not." The Template Method pattern above is the textbook use.

## `public` — The published API

`public` is a **promise**. Once other teams' code compiles against your public class/method, changing or removing it breaks them. That's why experienced engineers follow a simple rule:

> **Make everything `private` until proven otherwise.** Widen access only when there's a concrete need — narrowing later requires a migration.

## Real Organizational Scenarios

**Scenario 1 — The mutable-field incident.** A startup exposed `public Date createdAt` on its entities. A bug somewhere did `order.createdAt = null`, corrupting audit data and failing a compliance review. Fix: make fields `private final`, expose getters only. Encapsulation isn't academic — it's audit protection.

**Scenario 2 — Library evolution.** A payments SDK marked internal retry helpers as `public`. Thousands of customers started calling them; when the SDK needed to change them, they couldn't without breaking clients. Lesson recorded in their style guide: internal helpers go package-private in an `internal` package.

**Scenario 3 — Testing pressure.** Developers sometimes widen methods to `public` "just so tests can call them." Better patterns exist: keep tests in the same package (package-private access covers them), or test through the public API.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Public fields everywhere | No validation possible; any code can corrupt state | Private fields + behavior methods |
| `getter/setter` reflexively for everything | Fake encapsulation — still fully mutable | Expose setters only where mutation is a real domain operation |
| Marking helpers `public` "just in case" | Bloated, unchangeable API | Default to most restrictive access |
| Confusing default access with `protected` in subclasses across packages | Subclass can't see the member | Remember: default ≠ inherited by subclasses in other packages |
