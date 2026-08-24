---
title: Operators in Depth — Arithmetic, Bitwise, Comparison and Short-Circuit
summary: Every operator family with precedence, the bitwise operators that power flags and masks, short-circuit semantics, and the org patterns built on them.
order: 33
minutes: 20
topics: [operators, bitwise, short-circuit, precedence, flags, masks, instanceof, ternary]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/opsummary.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html
---

# Operators in Depth — Arithmetic, Bitwise, Comparison and Short-Circuit

## The concept: operators are the language's primitives

Every expression in Java is built from operators. Most are familiar from other languages; the ones that matter for backend code are the ones developers get wrong under pressure: **bitwise operators** (the basis of flags, permissions, and low-level parsing), **short-circuit logic** (the source of NPEs and of accidental non-execution), and **precedence** (the source of subtle bugs that look right).

The operator families: arithmetic (`+ - * / %`), unary (`++ -- ! ~ + -`), relational (`< > <= >= instanceof`), equality (`== !=`), logical (`&& ||`), bitwise (`& | ^ ~ << >> >>>`), assignment (`= += -= ...`), ternary (`?:`).

## Precedence — the bug generator

```java
// Precedence (high → low), the pairs people mix up:
//   * / %   →   + -   →   << >>   →   < > instanceof   →   == !=   →   &   →   ^   →   |   →   &&   →   ||
int x = 1 + 2 * 3;          // 7, not 9
boolean b = 2 > 1 == true;  // (2 > 1) == true → true — but confusing; parenthesize!
```

**The org rule:** when precedence isn't obvious to a reader, add parentheses. "Works by the spec, confuses the reviewer" is a code-review failure. Comparison-with-bitwise is the classic: `a & b == 0` parses as `a & (b == 0)` because `==` binds tighter than `&` — always parenthesize bitwise expressions.

## Bitwise operators — flags and masks

Bitwise operators work on the binary representation: `&` (AND), `|` (OR), `^` (XOR), `~` (NOT), `<<` (left shift = ×2^n), `>>` (arithmetic right shift), `>>>` (logical right shift).

**The flags pattern** — one `int`/`long` storing many booleans (permissions, feature toggles, notification settings):

```java
public final class Permissions {
    public static final int READ    = 1 << 0;   // 0001
    public static final int WRITE   = 1 << 1;   // 0010
    public static final int EXECUTE = 1 << 2;   // 0100

    // Set flags:  permissions |= READ | WRITE;
    // Check flag: (permissions & READ) != 0
    // Clear flag: permissions &= ~EXECUTE
    // Toggle:     permissions ^= WRITE
}
```

```java
// Real scenario — an access-control service combining role permissions:
public boolean can(PermissionSet set, int required) {
    return (set.bits() & required) == required;   // all required bits present
}
// Roles: ADMIN = READ|WRITE|EXECUTE; ANALYST = READ — combined via | and checked via &
```

**Shifts in the wild:** `1 << n` is 2^n — used for pagination-size math, hash spreading (`(h = key.hashCode()) ^ (h >>> 16)` — HashMap's spread), and color/image manipulation. `>>>` vs `>>` matters for signed values: `>>` preserves the sign bit (division-ish), `>>>` shifts in zeros.

## Short-circuit && and || — the semantics that bite

`&&` and `||` evaluate the right side **only if needed**. Two consequences:

1. **The NPE guard pattern:** `if (user != null && user.email() != null)` — safe because the second operand never runs when the first is false. This is *the* idiom.
2. **Side effects don't happen:** `if (queue.isEmpty() || queue.poll() == null)` — the `poll()` (a side effect!) never runs on an empty queue. If the right side has side effects, `&`/`|` (non-short-circuit) force evaluation — almost never what you want; prefer explicit statements.

```java
// Guard: the short-circuit IS the null check
if (order != null && order.getCustomer() != null && !order.getCustomer().isBlocked()) {
    fulfill(order);
}
```

## The ternary and instanceof

```java
String label = status == Status.PAID ? "Paid" : "Pending";   // ternary — keep them simple
boolean numeric = value instanceof Number;                   // instanceof — type check

// Pattern-matching instanceof (Java 16+) — the modern form, no cast needed:
if (payload instanceof OrderDto dto) {
    return process(dto);          // dto is already OrderDto
}
```

The org rule for ternaries: **one decision, no nesting**. A ternary inside a ternary is unreadable — extract a method. Prefer pattern-matching `instanceof` over the classic `instanceof` + cast pair.

## Pitfalls

- **`==` on objects** — with references it's identity, not equality (see the equals lesson). `Integer` caching makes `==` on small wrappers *appear* to work — a lying test.
- **Integer division** — `7 / 2` is `3`, not `3.5`; mixing in a double (`7 / 2.0`) fixes it. The classic percentage bug: `(part / total) * 100` is 0 when both are ints — do `(part * 100) / total` or use doubles.
- **`%` on negatives** — `-7 % 3` is `-1` in Java (sign follows the dividend), unlike some languages. For a non-negative remainder, use `Math.floorMod`.
- **`++`/`--` inside expressions** — `list.get(i++)` vs `list.get(++i)` are different; a review smell, split into statements.
- **Operator precedence with generics** — `new ArrayList<String>()` type-diamond vs `<` comparison confusion is a compile error, but precedence mistakes compile fine — that's why they're dangerous.

## Key takeaways

- Know the precedence table for the pairs people mix up (`&` vs `==`, shifts vs comparisons); parenthesize when non-obvious.
- Bitwise `& | ^ << >>` are the tools for flags, permissions, and masks — one int, many booleans.
- `&&`/`||` short-circuit — the null-guard pattern depends on it; never rely on side effects in the right operand.
- Pattern-matching `instanceof` replaces the cast idiom; keep ternaries single-decision.
- Watch integer division, negative `%`, and object `==`.
