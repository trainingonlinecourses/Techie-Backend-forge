---
title: Dynamic Proxies — Intercepting Every Call
module: java-reflection-annotations
order: 3
minutes: 27
topics: ["dynamic proxies", "InvocationHandler", "AOP", "interception", "Spring proxies"]
docs:
  - title: "Proxy (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/Proxy.html"
  - title: "InvocationHandler (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/InvocationHandler.html"
summary: A dynamic proxy is an object created at runtime that implements one or more interfaces you name, but with no handwritten class behind it. Instead, ...
---

# Dynamic Proxies — Intercepting Every Call

## The Concept: A Stand-In That Watches Every Method

A **dynamic proxy** is an object created *at runtime* that implements one or more interfaces you name, but with no hand-written class behind it. Instead, every method call on the proxy is routed to a single handler — `InvocationHandler.invoke(...)` — which can do *anything*: log the call, check permissions, measure time, forward to a real implementation, or change the behavior entirely.

**The mental model:** imagine a celebrity's assistant who answers every phone call. You dial the celebrity's number (the interface), but the assistant picks up (the proxy). The assistant can screen calls, take messages, log everything, or patch you through to the celebrity (the real implementation). The caller never knows the difference — they're talking to the interface, not to a specific person. The proxy *is* the interface; it just delegates to your handler for every call.

**Why this matters:** this is the foundation of Spring AOP and `@Transactional`. When you annotate a Spring bean method with `@Transactional`, Spring doesn't change your class — it creates a *proxy* of your bean at runtime, and the proxy's handler starts a transaction before delegating to your real method, then commits or rolls back after. `@Async`, `@Cacheable`, security checks, and audit logging all work the same way: proxies intercept the call, add the cross-cutting behavior, and delegate.

## Building a Proxy Step by Step

The machinery: `Proxy.newProxyInstance(classLoader, interfaces, handler)`. Let's build a logging proxy around a service interface:

```java
import java.lang.reflect.*;

// 1. An interface — proxies can only proxy interfaces (or JDK classes
//    that are interfaces). This is the contract the proxy implements.
interface Greeter {
    String greet(String name);
    void farewell(String name);
}

// 2. The REAL implementation the proxy will delegate to.
class RealGreeter implements Greeter {
    public String greet(String name) {
        return "Hello, " + name + "!";
    }
    public void farewell(String name) {
        System.out.println("Goodbye, " + name);
    }
}

public class ProxyDemo {
    public static void main(String[] args) {
        RealGreeter real = new RealGreeter();

        // 3. The InvocationHandler — called for EVERY method on the proxy.
        InvocationHandler handler = (proxy, method, methodArgs) -> {
            // Before-delegation logic: log the call.
            long start = System.nanoTime();
            System.out.println(">> calling " + method.getName());

            // Delegate to the real object.
            Object result = method.invoke(real, methodArgs);

            // After-delegation logic: timing.
            long ms = (System.nanoTime() - start) / 1_000_000;
            System.out.println("<< " + method.getName() + " took " + ms + " ms");
            return result;   // pass the real result back to the caller
        };

        // 4. Create the proxy. It implements Greeter — usable anywhere a
        //    Greeter is expected, but every call goes through `handler`.
        Greeter proxied = (Greeter) Proxy.newProxyInstance(
                Greeter.class.getClassLoader(),
                new Class<?>[] { Greeter.class },
                handler);

        // 5. Call through the proxy — observer the interleaving:
        System.out.println(proxied.greet("Alice"));
        //   >> calling greet
        //   Hello, Alice!
        //   << greet took 0 ms

        proxied.farewell("Bob");
        //   >> calling farewell
        //   Goodbye, Bob
        //   << farewell took 0 ms
    }
}
```

**Walking through it, piece by piece:**

- The interface `Greeter` defines the contract. **Key limitation:** JDK dynamic proxies can only implement *interfaces*. For classes, Spring falls back to CGLIB (bytecode generation that subclasses the class) — that's why Spring beans are proxied via interface or via CGLIB, and why self-invocation (`this.method()` inside the same bean) *bypasses* the proxy entirely.

- `InvocationHandler.invoke(proxy, method, args)` receives: the proxy itself, the `Method` being called, and its arguments. This single method is the interception point for *every* call.

- `method.invoke(real, methodArgs)` — the handler uses reflection to forward to the real object. This is the "patch through to the celebrity" step. The handler wraps it with before/after logic, producing the interleaved output.

- `Proxy.newProxyInstance` takes a class loader (usually the interface's), the interfaces to implement, and the handler. It returns an `Object` that *is* a `Greeter` — the caller uses it exactly like the real object, with zero awareness of the proxy.

## The Interception Pattern: What Proxies Make Possible

The before/after structure above generalizes to every cross-cutting concern:

```java
InvocationHandler txHandler = (proxy, method, args) -> {
    if (method.isAnnotationPresent(Transactional.class)) {
        beginTransaction();
        try {
            Object result = method.invoke(target, args);
            commit();
            return result;
        } catch (Throwable t) {
            rollback();
            throw t;
        }
    }
    // Methods without the annotation pass straight through:
    return method.invoke(target, args);
};
```

This is a miniature `@Transactional` — Spring's actual implementation does exactly this (plus more sophisticated proxy factories). The *same* pattern, with different before/after logic, produces: `@Async` (run on a thread pool), `@Cacheable` (check cache, then delegate, then populate cache), `@Secured` (check the current user's authorities before delegating), and audit logging (record who did what).

**The key architectural insight:** the *business class* stays completely clean — no transaction code, no logging code, no security code inside it. The cross-cutting behavior lives in the proxy, applied declaratively. This is **AOP (aspect-oriented programming)** in its simplest form, and it's why Spring can add transactions to any bean without you writing a single transaction call.

## Proxy Caveats That Bite Real Projects

1. **Self-invocation bypasses the proxy.** Inside a bean, calling `this.save()` skips the proxy — no transaction, no caching. This is the classic "why is my @Transactional not working?" bug. Fixes: inject yourself (`@Lazy` self-reference), move the call to another bean, or use `AopContext.currentProxy()`.

2. **Private and final methods are not proxied.** JDK proxies only see interface methods; CGLIB can't override `final` methods or intercept `private` ones. Annotations on non-proxyable methods silently do nothing — one of the most confusing silent failures in Spring.

3. **Proxy identity differs.** `proxied == real` is false; `proxied instanceof Greeter` is true. If your code compares bean references with `==`, proxies break it. Spring injects the proxy everywhere consistently, so this rarely bites — except when you store raw instances somewhere.

4. **Performance.** Each proxied call adds a handler hop. For typical business code this is negligible; for ultra-hot loops, proxies add measurable overhead, which is why tight numerical code avoids them.

## Beyond JDK Proxies: Bytecode Generation

JDK dynamic proxies are the pure-reflection path — but they only do interfaces. The more powerful family of tools *generates bytecode* at runtime: **CGLIB** subclasses a class (intercepting even non-interface methods), and **Byte Buddy / ASM** (used by Mockito, Hibernate, and modern Spring) manipulate bytecode directly for maximum flexibility and speed. Spring Boot 3 defaults to CGLIB-style proxying (`proxyTargetClass = true`) for all beans, which is why your `@Service` classes work without interfaces. The concept is identical — intercept calls, add behavior, delegate — only the mechanism (interface vs subclass vs bytecode) differs.

## Recap

A dynamic proxy is a runtime-generated stand-in for an interface that routes every call through an `InvocationHandler`, letting you add before/after behavior — logging, transactions, caching, security — without touching the business class. It's the engine of Spring AOP: `@Transactional`, `@Async`, and `@Cacheable` are all proxies. The trade-offs to respect: interfaces only (for JDK proxies), self-invocation bypasses the proxy, final/private methods are invisible to it, and identity shifts. Understand the proxy and Spring's "magic" becomes a concrete, debuggable mechanism — and the classic `@Transactional`-not-working bugs become predictable.
