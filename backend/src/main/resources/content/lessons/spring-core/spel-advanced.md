---
title: SpEL Advanced — Expressions in Security, Caching and Configuration
summary: The SpEL evaluation model, where SpEL appears in production (security, caching, @Value, routing), and the security/performance rules for untrusted expressions.
order: 23
minutes: 18
topics: [spel, expression, evaluation, spel-context, security-expressions, cache-keys, template-expressions]
docs:
  - https://docs.spring.io/spring-framework/reference/core/expressions.html
  - https://docs.spring.io/spring-security/reference/servlet/authorization/expression-based.html
---

# SpEL Advanced — Expressions in Security, Caching and Configuration

## The concept: Spring's expression language

**SpEL** (Spring Expression Language) is a small expression language evaluated at runtime: literals, property access, method calls, operators, collections, and safe navigation (`?.`). Its value is that expressions are **data** — stored in annotations, config files, or databases and evaluated later against a context.

```java
ExpressionParser parser = new SpelExpressionParser();
Expression exp = parser.parseExpression("'Hello '.concat(name)");
String result = exp.getValue(new StandardEvaluationContext(), String.class); // context holds name
```

The **evaluation context** binds variables and root objects: `#root`, `#this`, named variables (`#name`), and registered functions. Production code rarely builds contexts directly — but it *uses* SpEL everywhere:

## Where SpEL appears in production

**1. Method security (the biggest use).** Every `@PreAuthorize` string is a SpEL expression:

```java
@PreAuthorize("hasRole('ADMIN') or #order.ownerId == authentication.principal.id")
public Order getOrder(@P("order") OrderView order) { ... }
// #order → method argument; authentication.principal → the security context root
```

**2. Caching keys.** `@Cacheable` key expressions evaluate SpEL against method args:

```java
@Cacheable(value = "products", key = "#id + '-' + #locale")
public Product find(Long id, String locale) { ... }

@Cacheable(value = "products", key = "#root.methodName + ':' + #id")   // root = method info
@Cacheable(value = "quotes", condition = "#price > 100")              // conditional caching
```

**3. @Value.** `#{...}` for computed values (see the @Value lesson).

**4. Routing and conditions.** `@ConditionalOnExpression("${app.region:eu} == 'eu'")` in auto-configuration; `@EventListener(condition = "#event.status == 'PAID'")` filters events.

**5. Bean-to-bean references.** `#{someBean.someProperty}` in annotations and XML.

## Evaluation contexts in custom code

When your app evaluates SpEL (e.g., a rule engine), the two context types matter:

```java
// 1. StandardEvaluationContext — full power (methods, types, property access)
StandardEvaluationContext ctx = new StandardEvaluationContext();
ctx.setVariable("order", order);
// ctx.setRootObject(...)  → #root

// 2. SimpleEvaluationContext — deliberately limited (no type references, no constructors)
SimpleEvaluationContext simple = SimpleEvaluationContext
    .forReadOnlyDataBinding().withInstanceMethods().build();
```

**The security rule:** use `SimpleEvaluationContext` for any expression from **untrusted input** (a user-supplied rule, a configurable filter). `StandardEvaluationContext` exposes `T(...)` type references, constructors, and bean access — a user-supplied expression could instantiate classes or call arbitrary static methods (**SpEL injection**, an RCE-class vulnerability).

## The operators and helpers you'll use

- **Safe navigation:** `#order?.customer?.name` — null-safe chain, returns null instead of NPE.
- **Elvis:** `#name ?: 'unknown'` — default when null/empty.
- **Selection:** `#items.?[status == 'PAID']` — filter a collection; `^[...]` first match, `$[...]` last.
- **Projection:** `#items.![id]` — map to a property list.
- **Collections:** `{1, 2, 3}`, maps `{'a': 1}`; indexing `#items[0]`.
- **Operators:** `and/or/not`, `matches` (regex), `instanceof`, arithmetic, comparison.
- **`new`:** `new java.util.Date()` (only in StandardEvaluationContext — another reason it's dangerous for untrusted input).

## How we use it in an organization: the scenarios

**Scenario 1 — a configurable discount/eligibility rule engine.** Business rules stored in the database, evaluated safely:

```java
// Rule stored per tenant: "orders.amount > 500 and customer.tier == 'GOLD'"
SimpleEvaluationContext ctx = SimpleEvaluationContext
    .forReadOnlyDataBinding().build();
ctx.setVariable("orders", recentOrders);
boolean eligible = ruleParser.parse(tenant.getRule()).getValue(ctx, Boolean.class);
```

`SimpleEvaluationContext` keeps tenant-supplied rules read-only — no `T(...)`, no methods that mutate, no RCE.

**Scenario 2 — dynamic cache keys.** Keys that combine multiple args in a stable way (see above).

**Scenario 3 — conditional event handling.** React only to specific event states:

```java
@EventListener(condition = "#event instanceof T(com.acme.PaymentEvent) and #event.amount > 1000")
public void onLargePayment(PaymentEvent event) { ... }
```

**Scenario 4 — filter/search expressions in admin tools.** A stored filter string evaluated over collections (`#items.?[status == 'FAILED']`).

## Pitfalls

- **Never evaluate untrusted SpEL with `StandardEvaluationContext`** — type/constructor access = code execution. Use `SimpleEvaluationContext` and whitelist what the expression may touch.
- **Expressions are strings** — no compile-time checking; a typo in a `@PreAuthorize` or `@Cacheable` key surfaces at runtime (security: denied or caching misfires silently). Test the annotated methods.
- **Caching key collisions** — `key = "#id"` collides across methods with the same id; include the method or a distinguishing part.
- **Performance** — parsing an expression is slower than executing it; parse once (`Expression`) and reuse rather than parsing per evaluation.
- **`?.` vs `?.` chain length** — safe navigation stops at the first null; know what the rest of the chain gets (null).

## Key takeaways

- SpEL is data — evaluated later against a context: security, caching keys, @Value, events, rules.
- `StandardEvaluationContext` = full power (and RCE risk); `SimpleEvaluationContext` for untrusted input.
- Master `?:`, `?.`, `?[...]`, `![...]` for null-safety and collection logic.
- Expressions are unchecked strings — test every security/cache expression you write.
- Parse once and reuse for performance; scope contexts to the minimum capability.
