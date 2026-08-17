---
title: Reflection, Annotations & Class Loading
summary: Inspecting classes at runtime — the Class object, reflection API, annotation processing, dynamic proxies and how frameworks like Spring are built on top of it.
order: 20
minutes: 17
topics: [reflection, annotations, classloader, dynamic proxy, spring internals]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/package-summary.html
  - https://docs.oracle.com/javase/tutorial/reflect/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Class.html
---

# Reflection, Annotations & Class Loading

## What reflection is

Reflection lets a running program **inspect and manipulate itself**: list a class's methods, read annotations, construct objects and call methods when the names are only known as strings. It is the foundation every framework (Spring, Hibernate, Jackson) is built on — but it comes at a cost and is easy to misuse.

```java
Class<?> clazz = Class.forName("com.example.Order");      // load by name (string)
Method m = clazz.getMethod("total", BigDecimal.class);     // find a method
Object order = clazz.getDeclaredConstructor().newInstance(); // create without new
BigDecimal total = (BigDecimal) m.invoke(order);           // call it dynamically
```

## The `Class` object

Every type has exactly one `Class` instance at runtime, reachable three ways:

```java
Class<?> a = String.class;                    // type literal
Class<?> b = "hi".getClass();                 // from an instance
Class<?> c = Class.forName("java.lang.String"); // from a name (can throw ClassNotFoundException)
```

`Class` exposes the class's structure: `getDeclaredMethods()`, `getDeclaredFields()`, `getAnnotations()`, `getSuperclass()`, `getInterfaces()`, `isAnnotationPresent(...)`. Note the **`getDeclared*` vs `get*`** distinction: `getDeclaredX` returns members declared on this class only; `getX` includes inherited public members.

## Annotations as metadata

Annotations are inert by themselves — they only matter when something reads them. Define with `@interface`, and the reading side uses reflection:

```java
@Retention(RetentionPolicy.RUNTIME)   // keep in .class and visible at runtime (needed for reflection)
@Target(ElementType.METHOD)           // where it may appear
public @interface Audited {
    String actor() default "system";
}

// Reader — a mini-framework in 10 lines:
for (Method m : clazz.getDeclaredMethods()) {
    if (m.isAnnotationPresent(Audited.class)) {
        Audited a = m.getAnnotation(Audited.class);
        // record m.getName() + a.actor()
    }
}
```

Retention matters: `SOURCE` (compile-time only, e.g. Lombok's `@Getter`), `CLASS` (in the bytecode but not readable at runtime) and `RUNTIME` (what reflection sees — Spring's annotations use this).

## Module access: the big gotcha

Since Java 9's module system, reflection into **non-exported** packages throws `InaccessibleObjectException` unless the module opens them:

```
--add-opens java.base/java.util=ALL-UNNAMED
```

Frameworks that need deep access (serialization, ORMs) require you to add these flags — one of the first things you hit when running Spring Boot on a newer JDK.

## Performance and safety

- **Reflection is slow** relative to direct calls (JIT can't inline through `Method.invoke`). Cache `Method`/`Constructor` lookups in a map; never re-derive them per call.
- **`setAccessible(true)` breaks encapsulation** — use only in framework code, never to work around a bad design in application code.
- Prefer **`MethodHandles`** (java.lang.invoke) and **`VarHandle`** where you can — they're faster and respect module access rules properly.
- `invoke` wraps thrown exceptions in `InvocationTargetException` — unwrap it or you lose the real stack.

## Dynamic proxies: the trick behind Spring's AOP

`java.lang.reflect.Proxy` creates an implementation of an interface at runtime where every method call is routed through an `InvocationHandler`. This is exactly how Spring applies `@Transactional` and `@Cacheable`:

```java
OrderService proxy = (OrderService) Proxy.newProxyInstance(
    OrderService.class.getClassLoader(),
    new Class<?>[] { OrderService.class },
    (target, method, args) -> {
        if (method.isAnnotationPresent(Transactional.class)) beginTx();
        try { return method.invoke(realService, args); }
        catch (Exception e) { rollbackTx(); throw e; }
        finally { endTx(); }
    });
```

That's why **Spring can only advise beans accessed through the proxy** — a self-invocation (`this.someMethod()`) bypasses the proxy entirely, which is why internal `@Transactional` calls silently don't start transactions.

## The class loading pipeline

`javac` compiles `.java` → `.class` (bytecode). At runtime the **class loaders** (bootstrap → platform → application, parent-first delegation) find and load `.class` files, **linking** verifies bytecode, and **initialization** runs static initializers. `Class.forName(...)` triggers initialization; `Class.forName(..., false, loader)` loads without initializing — a trick used by JDBC drivers.

## Key takeaways

- Reflection = runtime introspection: `Class`, `getDeclaredMethods()`, annotations with `RUNTIME` retention, `Method.invoke`.
- It powers every framework — including Spring's own dependency injection and AOP (dynamic proxies).
- Use it in library/framework code, cache lookups, and prefer `MethodHandles` for performance.
- Remember the JDK 9 module wall (`--add-opens`) and that proxy-based AOP never sees self-invocations.

Official docs: [java.lang.reflect](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/package-summary.html) · [The Reflection Tutorial](https://docs.oracle.com/javase/tutorial/reflect/)
