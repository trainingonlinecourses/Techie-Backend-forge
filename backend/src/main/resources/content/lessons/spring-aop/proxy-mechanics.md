---
title: Proxy Mechanics — JDK Dynamic Proxies vs CGLIB
summary: How Spring creates proxies, JDK interface proxies vs CGLIB subclass proxies, proxyMode choices, and the proxy pitfalls (self-invocation, final classes).
order: 5
minutes: 18
topics: [jdk-proxy, cglib, proxyfactory, proxy-mode, self-invocation, final-class, aop-proxying]
docs:
  - https://docs.spring.io/spring-framework/reference/core/aop/proxying.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/Proxy.html
---

# Proxy Mechanics — JDK Dynamic Proxies vs CGLIB

## The concept: AOP works through proxies

When Spring's AOP (or `@Transactional`, `@Async`, `@Cacheable`, method security) wraps a bean, the injected reference is **not your class** — it's a **proxy** that intercepts method calls, runs the advice (transaction interceptor, cache interceptor, aspect), then delegates to your real method. Two proxy technologies exist:

- **JDK dynamic proxy** — `java.lang.reflect.Proxy`: implements the bean's *interfaces*, forwards calls through an `InvocationHandler`. Requires the bean to implement at least one interface.
- **CGLIB proxy** — generates a *subclass* of the bean class at runtime, overriding its methods. Works for classes without interfaces (and for `@Configuration` classes). Since Spring Framework 4.0 (Boot 1.x era), **CGLIB is the default** when no interface is available — and Spring Boot configures `proxyTargetClass=true` by default, so CGLIB is used even when interfaces exist.

```java
@Service
public class OrderService implements OrderApi {
    @Transactional
    public void placeOrder(...) { ... }
}

// With proxyTargetClass=false (default in plain Spring when an interface exists):
//   injected bean = JDK proxy implementing OrderApi
// With Spring Boot default (proxyTargetClass=true):
//   injected bean = CGLIB subclass of OrderService
```

From the caller's side it's transparent — `@Autowired OrderService` receives the proxy. From the *inside* it is not: **calls from within the same object (`this.method()`) bypass the proxy entirely**, because the proxy only intercepts calls that go *through* it.

## How we use it in an organization: the scenarios

**Scenario 1 — why self-invocation breaks @Transactional (the classic).**

```java
@Service
public class OrderService {
    public void process(Order o) {
        save(o);                     // this.save() — bypasses the proxy!
        notify(o);
    }

    @Transactional
    public void save(Order o) { repo.save(o); }
}

// process() calls save() via THIS — no proxy → no transaction.
// The two DB writes run without a transaction boundary.
```

Fixes, in org preference order:

```java
// 1. Inject self (Boot 2.6+): call through the proxy
@Lazy @Autowired private OrderService self;
public void process(Order o) { self.save(o); ... }

// 2. Move the transactional method to a separate bean (Spring's advice — separation of concerns)
@Service public class OrderWriter { @Transactional public void save(Order o) {...} }

// 3. Use TransactionTemplate programmatically for the one-off case
```

**Scenario 2 — final methods and classes.** CGLIB *subclasses* your class — so a `final` method can't be overridden and a `final` class can't be proxied at all. `@Transactional` on a final method **silently doesn't apply** (CGLIB just can't intercept it). The org rule: **don't mark classes/methods final that need AOP/transactions** — or make the class implement an interface and switch to JDK proxies.

**Scenario 3 — @Configuration proxying.** Spring proxied `@Configuration` classes so that `@Bean` methods called from other `@Bean` methods return the *singleton* instead of a new instance. If you set `proxyBeanMethods = false` (perf micro-opt), that guarantee disappears — bean-to-bean calls now create separate instances. Another example of proxy behavior silently changing semantics.

**Scenario 4 — the proxy's class, in logs and instanceof.** `orderService.getClass()` returns the CGLIB subclass name (`OrderService$$SpringCGLIB$$0`), not `OrderService`. Code that does `instanceof OrderService` still passes (subclass), but `getClass() == OrderService.class` fails, and reflection over the bean sees proxy methods. Tools (and debugging) must expect proxies.

## proxyTargetClass — choosing the mode

```java
@EnableAspectJAutoProxy(proxyTargetClass = true)   // default in Boot: CGLIB
// or explicitly in plain Spring config
```

| Mode | Mechanism | Requires | Notes |
|---|---|---|---|
| JDK proxy | `java.lang.reflect.Proxy` | an interface | lighter, standard; only intercepts interface methods |
| CGLIB | runtime subclass | non-final class/methods | intercepts concrete methods; Boot default |

One subtle JDK-proxy limitation: **only interface methods are intercepted**. If a bean implements `OrderApi` and also has public methods *not* in the interface, JDK-proxy AOP won't intercept the non-interface ones; CGLIB would. This asymmetry is why Boot defaults to CGLIB and why `proxyTargetClass=true` is the modern standard.

## Pitfalls

- **Self-invocation silently skips advice** — no error, no log; the transaction/cache/async just doesn't happen. The failure mode is *silent*, which makes it the most dangerous proxy gotcha.
- **`final` + AOP = no-op advice** — compile-time fine, runtime silently unproxied. Add a test asserting the bean is a proxy (`assertThat(AopUtils.isAopProxy(bean)).isTrue()`) if it matters.
- **Serialization of proxies** — CGLIB proxies carry extra fields; serializing a proxied bean (session storage) can fail. Store DTOs, not proxies.
- **`this` vs proxy in constructors** — calling a proxied method from the constructor runs through the proxy *before* the bean is fully initialized; avoid.
- **Type mismatches in injection** — with `proxyTargetClass=false` and multiple interfaces, injecting by a *non-interface* type fails ("no qualifying bean"); CGLIB (`true`) avoids most of these.

## Key takeaways

- AOP/transactions/caching/method-security all work by proxying the bean; the injected reference is a proxy.
- JDK proxies need interfaces and only intercept interface methods; CGLIB subclasses work on classes (Boot default).
- Self-invocation bypasses the proxy — inject self or split beans for transactional boundaries.
- `final` classes/methods can't be proxied — advice silently doesn't apply.
- Expect proxies in logs/reflection; test `isAopProxy` when interception is critical.
