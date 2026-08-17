---
title: SpEL — Spring Expression Language
summary: The expression language behind @Value, @PreAuthorize, security rules and Spring Integration — syntax, evaluation contexts and when to use it.
order: 10
minutes: 14
topics: [spel, expression language, evaluation context, template expressions]
docs:
  - https://docs.spring.io/spring-framework/reference/core/expressions.html
---

# SpEL — Spring Expression Language

## What SpEL is

SpEL is a small expression language evaluated at runtime, wired into nearly every Spring project:

- `@Value("#{systemProperties['user.name']}")` — property injection from an expression
- `@PreAuthorize("hasRole('ADMIN') and #order.amount < 1000")` — security rules
- `@Cacheable(key = "#id")`, `@EventListener(condition = "#event.ok")`, Spring Integration routers, Spring Data queries

An expression is **parsed once** into a `Expression` object, then evaluated many times:

```java
ExpressionParser parser = new SpelExpressionParser();
Expression expr = parser.parseExpression("'Hello, '.concat(#name)");
String out = expr.getValue(new EvaluationContext() /* with #name bound */, String.class);
```

## Core syntax

| Construct | Example | Meaning |
|---|---|---|
| Literals | `'text'`, `42`, `3.14`, `true` | strings need single quotes |
| Property/method access | `user.name`, `order.total()` | navigation and method calls |
| Elvis operator | `name ?: 'anonymous'` | null-coalescing (`name != null ? name : 'anonymous'`) |
| Safe navigation | `user?.address?.city` | null-safe chain (no NPE) |
| Collections | `items[0]`, `map['key']`, `items.?[price > 10]` | index, selection (filter) |
| Projection | `items.![name]` | map over a collection |
| Ternary | `age >= 18 ? 'adult' : 'minor'` | conditional |
| Operators | `and`, `or`, `not`, `matches`, `instanceof`, `matches '^\\d+$'` | logical and regex |
| Types | `T(java.lang.Math).PI` | access static members |

```java
// Selection + projection: expensive items, then their names
List<String> names = (List<String>) parser.parseExpression(
    "items.?[price > 10].![name]").getValue(context);
```

## The evaluation context

`StandardEvaluationContext` binds variables (`#name`), root objects and functions; **`SimpleEvaluationContext`** is the restricted, safer subset (no type constructors, no bean references) recommended for expressions you don't fully control — e.g. user-supplied input.

```java
StandardEvaluationContext ctx = new StandardEvaluationContext();
ctx.setVariable("name", "Ada");
ctx.setRootObject(order);
```

## Bean references and templates

- `@beanName` (or `@('beanName')`) resolves a Spring bean — `#{@mailer.send(#to)}` inside `@Value`.
- **Template expressions** mix literal text and SpEL: `#{'Hello ' + #name}` — but the property placeholder `#{}` vs `${}` distinction trips everyone:

```java
@Value("${app.name}")          // property placeholder — resolved from Environment/properties
@Value("#{systemProperties['user.name']}")  // SpEL — evaluated as an expression
@Value("${app.welcome} #{systemProperties['user.name']}")  // both, in one string
```

## Security with SpEL

`@PreAuthorize` and `@PostAuthorize` are SpEL over the `SecurityExpressionRoot`:

```java
@PreAuthorize("hasAuthority('ORDER_WRITE')")
@PreAuthorize("hasRole('ADMIN') or #order.owner == authentication.name")
@PostAuthorize("returnObject.owner == authentication.name")  // filter the returned object
```

`hasRole`, `hasAuthority`, `hasIpAddress`, `#root`, `authentication`, `returnObject` are all available in that context.

## When (not) to use SpEL

**Use it** for declarative, configuration-driven behavior: security rules, caching keys, routing conditions — places where the expression is data, not code.

**Avoid it** for application logic you could write in Java: it's stringly-typed, slower than compiled code, and IDE/refactor-unfriendly. And never evaluate untrusted input against `StandardEvaluationContext` — arbitrary type construction makes it a code-execution vector.

## Key takeaways

- SpEL powers `@Value` (`#{}`), `@PreAuthorize`, cache keys, event conditions, Integration routing.
- Parse once, evaluate many times; bind data via `EvaluationContext` variables.
- `?[...]` filters, `![...]` projects, `?:` elvis, `?.` safe navigation — the five you'll actually use.
- Use `SimpleEvaluationContext` for untrusted expressions; keep logic in Java and SpEL as configuration.

Official docs: [Spring Expression Language](https://docs.spring.io/spring-framework/reference/core/expressions.html)
