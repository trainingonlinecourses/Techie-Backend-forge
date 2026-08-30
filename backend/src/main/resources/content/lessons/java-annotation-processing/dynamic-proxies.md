---
title: Dynamic Proxies — Runtime Code Generation
summary: How Java creates proxy classes at runtime, the Proxy and InvocationHandler API, when to use JDK proxies vs CGLIB, and how Spring AOP is built on top of them.
order: 3
minutes: 25
topics: [dynamic-proxy, proxy, invocation-handler, cglib, spring-aop, runtime-generation]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/reflect/Proxy.html
---

## The Concept, From Zero

A dynamic proxy creates a new class at runtime that implements one or more interfaces. You give it an `InvocationHandler` that intercepts every method call. The proxy class never exists on disk — it's generated in memory by the JVM.

```java
// What you write:
MyInterface proxy = (MyInterface) Proxy.newProxyInstance(
    MyInterface.class.getClassLoader(),
    new Class[]{MyInterface.class},
    (obj, method, args) -> {
        System.out.println("Intercepted: " + method.getName());
        return method.invoke(realObject, args);  // delegate to real object
    }
);

proxy.doSomething();  // prints "Intercepted: doSomething", then calls real object
```

This is the foundation of Spring AOP, transaction management, and remote method invocation.

---

## The Proxy API

### Creating a Proxy

```java
import java.lang.reflect.*;

// The interface to proxy
interface UserService {
    User findById(Long id);
    void save(User user);
}

// Create the proxy
UserService proxy = (UserService) Proxy.newProxyInstance(
    UserService.class.getClassLoader(),   // class loader
    new Class[]{UserService.class},       // interfaces to implement
    new LoggingHandler(new UserServiceImpl())  // our interceptor
);
```

### InvocationHandler

```java
class LoggingHandler implements InvocationHandler {
    private final Object target;

    LoggingHandler(Object target) {
        this.target = target;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println("[LOG] Before: " + method.getName());
        Object result = method.invoke(target, args);  // call real method
        System.out.println("[LOG] After: " + method.getName());
        return result;
    }
}
```

---

## Line-by-Line Walkthrough

```java
import java.lang.reflect.*;
import java.util.*;

public class DynamicProxyDemo {

    // The real service
    static class OrderServiceImpl {
        public String createOrder(String item) {
            return "Order-" + item.hashCode();
        }
        public void cancelOrder(String orderId) {
            System.out.println("Cancelled: " + orderId);
        }
    }

    // InvocationHandler that adds logging
    static class LoggingHandler implements InvocationHandler {
        private final Object target;
        private final List<String> log = new ArrayList<>();

        LoggingHandler(Object target) { this.target = target; }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            long start = System.currentTimeMillis();
            System.out.println("→ Calling: " + method.getName() + "(" + Arrays.toString(args) + ")");

            Object result = method.invoke(target, args);

            long elapsed = System.currentTimeMillis() - start;
            System.out.println("← Returned: " + result + " [" + elapsed + "ms]");
            log.add(method.getName() + " took " + elapsed + "ms");
            return result;
        }

        public List<String> getLog() { return log; }
    }

    // InvocationHandler that adds caching
    static class CachingHandler implements InvocationHandler {
        private final Object target;
        private final Map<String, Object> cache = new HashMap<>();

        CachingHandler(Object target) { this.target = target; }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            String key = method.getName() + ":" + Arrays.toString(args);

            if (cache.containsKey(key)) {
                System.out.println("CACHE HIT: " + key);
                return cache.get(key);
            }

            Object result = method.invoke(target, args);
            cache.put(key, result);
            System.out.println("CACHE MISS: " + key + " → cached");
            return result;
        }
    }

    public static void main(String[] args) {
        OrderServiceImpl realService = new OrderServiceImpl();

        // Create a logging proxy
        LoggingHandler handler = new LoggingHandler(realService);
        Object proxy = Proxy.newProxyInstance(
            OrderServiceImpl.class.getClassLoader(),
            OrderServiceImpl.class.getInterfaces(),
            handler
        );

        // Call through proxy
        var proxyService = (OrderServiceImpl) proxy;  // cast to use it
        proxyService.createOrder("laptop");
        proxyService.cancelOrder("Order-123");

        // The proxy IS-A Object (not OrderServiceImpl)
        System.out.println("Is proxy: " + Proxy.isProxyClass(proxy.getClass()));
        System.out.println("Log entries: " + handler.getLog());
    }
}
```

---

## JDK Proxy vs CGLIB

### JDK Dynamic Proxy
- Requires the target to implement at least one interface
- Creates a new class implementing those interfaces
- Used by Spring when the bean implements an interface

### CGLIB Proxy
- Works with any class (no interface needed)
- Creates a subclass of the target class
- Used by Spring when the bean doesn't implement an interface
- Cannot proxy final classes or final methods

```java
// JDK proxy (target implements interface)
UserService proxy = (UserService) Proxy.newProxyInstance(
    UserService.class.getClassLoader(),
    new Class[]{UserService.class},
    handler
);

// CGLIB proxy (target is any class) — Spring does this automatically
// @Configuration classes use CGLIB to intercept @Bean methods
```

---

## Real-World Scenarios

### Scenario 1: Transaction proxy (simplified Spring)

```java
class TransactionHandler implements InvocationHandler {
    private final Object target;

    TransactionHandler(Object target) { this.target = target; }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println("[TX] BEGIN");
        try {
            Object result = method.invoke(target, args);
            System.out.println("[TX] COMMIT");
            return result;
        } catch (Exception e) {
            System.out.println("[TX] ROLLBACK");
            throw e;
        }
    }
}

// Usage
UserService txService = (UserService) Proxy.newProxyInstance(
    UserService.class.getClassLoader(),
    new Class[]{UserService.class},
    new TransactionHandler(new UserServiceImpl())
);
txService.save(user);  // wrapped in BEGIN/COMMIT or ROLLBACK
```

### Scenario 2: Access control proxy

```java
class SecurityHandler implements InvocationHandler {
    private final Object target;
    private final Set<String> adminMethods = Set.of("delete", "update");

    SecurityHandler(Object target) { this.target = target; }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        if (adminMethods.contains(method.getName()) && !currentUserIsAdmin()) {
            throw new SecurityException("Admin access required for: " + method.getName());
        }
        return method.invoke(target, args);
    }

    private boolean currentUserIsAdmin() {
        return "ADMIN".equals(System.getenv("ROLE"));
    }
}
```

### Scenario 3: Remote method invocation

```java
class RemoteHandler implements InvocationHandler {
    private final String host;
    private final int port;

    RemoteHandler(String host, int port) {
        this.host = host;
        this.port = port;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // Serialize method name + args, send over network, deserialize result
        // This is how RMI and gRPC work conceptually
        System.out.println("RPC: " + method.getName() + " → " + host + ":" + port);
        return null; // actual implementation would send over network
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Proxying a final class | CGLIB creates subclasses — can't extend finals | Remove final modifier or use interface-based proxy |
| Forgetting to delegate | Method calls never reach real object | Always call `method.invoke(target, args)` |
| Catching all exceptions | Proxy hides errors from caller | Only catch exceptions you can handle |
| Using proxy for simple delegation | Adds complexity for no benefit | Only proxy when you need cross-cutting concerns |
