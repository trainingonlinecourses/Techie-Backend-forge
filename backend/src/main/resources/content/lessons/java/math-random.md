---
title: Math Class & Random — Numbers Beyond Basic Arithmetic
summary: The Math utility methods every developer should know, why Math.random() is the wrong tool for real applications, and the SecureRandom vs Random vs ThreadLocalRandom decision organizations actually face.
order: 74
minutes: 16
topics: [math-class, random, securerandom, threadlocalrandom, rounding, abs-pow]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Math.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/security/SecureRandom.html
---

## The Concept, From Zero

`java.lang.Math` is a utility class of **static** methods — no objects needed. You've used `Math.max` already; here are the ones that matter daily:

```java
int    m = Math.max(3, 7);          // 7 — larger of two values (also min)
double r = Math.round(2.567 * 100) / 100.0;   // 2.57 — round to 2 decimals the classic way
long   dist = Math.abs(-42L);       // 42 — magnitude without sign
double area = Math.PI * Math.pow(radius, 2); // pow = exponentiation
double root = Math.sqrt(144);        // 12.0
int    floor = Math.floorDiv(-7, 2); // -4 — division that floors toward negative infinity
```

Line-by-line notes on the non-obvious ones:

| Call | Gotcha explained |
|---|---|
| `Math.round(2.5)` → `3`, but `Math.round(-2.5)` → `-2` | Rounds half **up**, so negatives round toward zero — asymmetric! |
| `(int) Math.random()` style truncation | Truncates toward zero; combine with scaling carefully |
| `Math.floorDiv(-7, 2)` → `-4` vs `-7 / 2` → `-3` | Plain `/` truncates toward zero; floorDiv matches mathematical flooring |
| `Math.addExact(a, b)` | Throws on overflow instead of silently wrapping — use in financial code |

> ⚠️ For money: none of these belong near currency math. Use `BigDecimal` (see its dedicated lesson) — floating point can't represent 0.1 exactly.

## Random Numbers — Three Tools, Three Jobs

### 1. `Math.random()` — quick and dirty

```java
int dieRoll = (int) (Math.random() * 6) + 1;  // scale to [0..6), truncate, shift to 1..6
```

- Internally delegates to a shared `Random`. Fine for exercises; nobody should build features on it because you can't seed, test, or replace it.

### 2. `java.util.Random` — general purpose

```java
Random random = new Random(12345L);              // seeded: same seed → identical sequence every run
int roll      = random.nextInt(6) + 1;           // 1..6 inclusive-exclusive trick again
int anyInt    = random.nextInt();                // full int range
double gauss  = random.nextGaussian();           // bell-curve sample, mean 0 std 1

List<String> options = List.of("a", "b", "c");
String pick = options.get(random.nextInt(options.size()));  // random element, index-safe
```

Why the seed matters: with a fixed seed, "randomness" becomes **reproducible** — invaluable when debugging simulations or generating deterministic test data.

Two production cautions:
- One `Random` instance shared across threads degrades into contention and (historically) contention-biased sequences.
- Its output is predictable — if you know ~two outputs, algorithms can recover the seed.

### 3. `ThreadLocalRandom` & `SecureRandom` — the professional choices

```java
// Multi-threaded code: each thread gets its own generator, zero contention
int roll = ThreadLocalRandom.current().nextInt(1, 7);   // bounds are inclusive-low, EXCLUSIVE-high

// Security-sensitive randomness: tokens, keys, reset links
SecureRandom secure = new SecureRandom();
byte[] tokenBytes = new byte[32];
secure.nextBytes(tokenBytes);                            // cryptographically strong entropy
String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
```

| Tool | Use for | Never use for |
|---|---|---|
| `Math.random()` | Throwaway scripts | Anything shipped |
| `Random` | Simulations, games, seeded tests | Tokens/passwords |
| `ThreadLocalRandom` | Concurrent sampling | Tokens/passwords |
| `SecureRandom` | Sessions, OTPs, API keys | High-volume simulation (it's slower) |

## Real Organizational Scenarios

**Scenario 1 — Password reset vulnerability.** A startup generated reset tokens with `new Random()` seeded by `System.currentTimeMillis()`. An attacker guessed seeds by clock-skew brute force and hijacked accounts. Post-incident fix: `SecureRandom` only, enforced by code review checklist.

**Scenario 2 — Load testing.** A QA team seeds `Random` per virtual user (`new Random(userIndex)`) so test runs are reproducible — the exact same traffic pattern replays while they hunt a flaky race condition.

**Scenario 3 — A/B testing assignment.** Assigning users to experiment groups uses `new Random(userId.hashCode())` — deterministic per user, so the same customer always lands in the same group across sessions without storing anything.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `nextInt(6) + 1` vs `nextInt(1, 7)` confusion | Off-by-one dice that never roll a 6 | Remember: upper bound is always exclusive |
| `Random` for security tokens | Predictable credentials | SecureRandom, always |
| Sharing one Random across threads | Contention, skewed sequences | ThreadLocalRandom.current() |
| Floating-point money rounding via Math.round | Cents drift in reports | BigDecimal with explicit RoundingMode |
