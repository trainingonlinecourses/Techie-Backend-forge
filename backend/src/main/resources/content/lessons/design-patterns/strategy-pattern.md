---
title: Strategy Pattern — Swapping Algorithms at Runtime
module: design-patterns
order: 4
minutes: 25
topics: ["strategy", "polymorphism", "composition over inheritance", "algorithm selection", "DIP"]
docs:
  - title: "Strategy (Refactoring Guru)"
    url: "https://refactoring.guru/design-patterns/strategy"
summary: Your checkout needs discounts. Rules so far:
---

# Strategy Pattern — Swapping Algorithms at Runtime

## The Concept: The Exploding if/switch

Your checkout needs discounts. Rules so far:

```java
double price = base;
if (member)            price *= 0.9;
else if (holiday)      price *= 0.85;
else if (newCustomer)  price *= 0.95;
// ... and next month there's a coupon rule, a bulk rule, a VIP tier rule...
```

Every new rule means editing this method — which risks breaking existing rules, bloats the method, and makes the decision logic untestable in isolation. This is the classic **open/closed principle** violation: the code is *open* for modification (you keep editing it) instead of *open for extension* (you add new behavior without touching existing code).

**The Strategy pattern** fixes it with three pieces:

1. **A strategy interface** — declares the algorithm's contract (`double discount(double base)`).
2. **Concrete strategies** — one class per algorithm (member discount, holiday discount, none).
3. **A context** — holds a *current* strategy and delegates to it.

The key move: **the algorithm becomes a pluggable object**. The checkout doesn't contain the rules; it holds a reference to whichever rule object it was given — and that reference can change at **runtime** (per order, per user, per request).

## Composition over Inheritance

The alternative — subclassing `Checkout` for every rule combination (MemberHolidayCheckout, NewCustomerHolidayCheckout, ...) — explodes combinatorially (2 rules = 4 classes; 10 rules = 1,024). Strategy uses **composition**: the context *has* a strategy (a field) instead of *being* every variation (inheritance). This is the famous principle: *favor composition over inheritance* — flexible behavior is assembled by combining small objects, not by deep class hierarchies.

## The Code Walkthrough

```java
// ---- 1. The strategy interface: the contract every rule honors ----
interface DiscountStrategy {
    double apply(double basePrice);
}

// ---- 2. Concrete strategies: one class per rule ----
class MemberDiscount implements DiscountStrategy {
    public double apply(double basePrice) { return basePrice * 0.90; }
}

class HolidayDiscount implements DiscountStrategy {
    public double apply(double basePrice) { return basePrice * 0.85; }
}

class NoDiscount implements DiscountStrategy {
    public double apply(double basePrice) { return basePrice; }
}

// ---- 3. The context: holds a strategy and delegates ----
class Checkout {
    private DiscountStrategy strategy;      // pluggable — can change at runtime

    Checkout(DiscountStrategy strategy) { this.strategy = strategy; }

    void setStrategy(DiscountStrategy s) { this.strategy = s; }   // swap mid-flight

    double total(double basePrice) {
        double discounted = strategy.apply(basePrice);            // delegate!
        return discounted + tax(discounted);
    }

    private double tax(double p) { return p * 0.08; }
}

public class StrategyDemo {

    public static void main(String[] args) {
        Checkout checkout = new Checkout(new NoDiscount());
        System.out.println(checkout.total(100));     // 108.0  (no discount)

        // Swap the strategy at runtime — no code change, just a new object:
        checkout.setStrategy(new MemberDiscount());
        System.out.println(checkout.total(100));     // 97.2   (10% off + tax)

        checkout.setStrategy(new HolidayDiscount());
        System.out.println(checkout.total(100));     // 91.8   (15% off + tax)
    }
}
```

### Walking Through Each Part

**The interface** — `DiscountStrategy` is the *contract*: "any rule takes a base price and returns a discounted price." The context doesn't know (or care) which rule it's talking to.

**The concrete strategies** — each rule is a tiny class with one method. Adding a `VipDiscount` = add one class, no edits anywhere else. Each rule is independently testable: `new MemberDiscount().apply(100)` → `90.0`.

**The `Checkout` context** — it holds a strategy *field* and delegates: `strategy.apply(basePrice)`. `setStrategy` lets you swap the algorithm at runtime — the same checkout object applies a different rule per call. The `total` method doesn't contain a single discount `if` — the rules live entirely in the strategies.

**The demo** — the same `Checkout` object produces three different totals as its strategy changes. Adding a rule tomorrow means writing one class and handing it to `setStrategy` — zero changes to `Checkout`.

## The Functional Shortcut

Because a strategy is "one method with a signature", a **lambda** implements it directly:

```java
checkout.setStrategy(p -> p * 0.80);              // anonymous rule
// or from a config value:
checkout.setStrategy(price -> price * (1 - coupon.rate()));
```

For simple rules, the interface can even be a functional interface and callers supply lambdas. For *complex* multi-method strategies, keep real classes.

## Strategy in the Real World

- **`Comparator`** — you met it: sorting is a strategy that can be swapped (`sort` with different comparators).
- **Spring `Profile` / `@ConditionalOnProperty`** — the container picks a bean (strategy) per environment.
- **Payment providers** — a `PaymentStrategy` per provider (card, PayPal, crypto), selected at runtime.
- **`ExecutorService` / thread pools** — different scheduling strategies behind one interface.
- **Authentication providers** — `AuthenticationManager` delegating to provider strategies.

## The Decision Table

| Use Strategy when | Don't when |
|---|---|
| Multiple algorithms do the same job, chosen at runtime | One algorithm, no variation |
| Rules change frequently (new rules = new classes) | Rules are stable and few |
| `if/switch` chains select behavior by type/state | The selection is trivial |
| You want each algorithm independently testable | The "algorithm" is 2 lines |

## Common Beginner Pitfalls

1. **Giant strategy interfaces** — a strategy with 5 methods is a different pattern (and probably should be split). Keep strategies single-purpose.
2. **Strategy classes with internal state** — strategies should be stateless (safe to share); config belongs in constructor args (e.g., `new BulkDiscount(10, 0.2)`).
3. **Context leaking strategy decisions** — the context should *delegate*, not re-check `instanceof` or re-implement the rule.
4. **Over-application** — one `if` is not a strategy problem; the pattern pays off with 3+ variants or frequent change.
5. **Choosing strategy by string/enum inside the context** — that recreates the switch you removed; let the *caller* pick the strategy (or a small factory).

## Key Takeaways

- Strategy turns an algorithm into a pluggable object behind an interface.
- Context holds a strategy field and delegates — algorithms swap at runtime.
- Composition over inheritance: assemble behavior from small objects instead of subclassing.
- Adding a rule = one new class; existing code untouched (open/closed principle).
- `Comparator` is the Strategy pattern in the JDK; lambdas can implement simple strategies directly.
