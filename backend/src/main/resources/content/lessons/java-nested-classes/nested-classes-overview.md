---
title: Nested Classes — Inner, Static, Local, and Anonymous
summary: What nested classes are, when to use each type, memory implications, and how organizations use them for encapsulation and callbacks.
order: 2
minutes: 22
topics: [nested-classes, inner-class, static-inner, local-class, anonymous-class]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/nested.html
---

## The Concept, From Zero

Java lets you define a class inside another class. There are 4 types:

| Type | Syntax | Access to outer | Use case |
|------|--------|-----------------|----------|
| **Member inner** | `class Inner {}` | Instance fields | Tightly coupled helper |
| **Static nested** | `static class Nested {}` | Static fields only | Helper that doesn't need outer |
| **Local** | Defined inside a method | Local variables (effectively final) | Method-specific logic |
| **Anonymous** | `new Interface() { ... }` | Local variables (effectively final) | One-time implementations |

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Member inner class — has access to outer instance
2. Can access outer class's instance field
3. Line 2: Static nested class — no access to outer instance
4. Line 3: Local class — defined inside a method
5. Line 4: Anonymous class — one-time implementation
6. Anonymous class implementing Comparator
7. Equivalent to lambda: names.sort((a, b) -> Integer.compare(a.length(), b.length()));
8. Line 5: Practical — Builder pattern with nested class
9. Line 6: Practical — Event listener with anonymous class
10. Process events
11. Line 7: Creating instances
12. Line 8: Builder pattern
13. Line 9: Anonymous class usage

The same code, clean:

```java
import java.util.*;
import java.util.function.*;

public class NestedClassesDemo {

    class Connection {
        private String url;

        Connection(String url) { this.url = url; }

        void printConfig() {
            System.out.println("URL: " + url + ", Timeout: " + timeout);
        }
    }

    static class ConnectionConfig {
        private final String host;
        private final int port;

        ConnectionConfig(String host, int port) {
            this.host = host;
            this.port = port;
        }

        String toUrl() { return "http://" + host + ":" + port; }
    }

    void processOrders(List<Order> orders) {
        class OrderProcessor {
            private int processed = 0;

            void process(Order order) {
                if (order.isValid()) {
                    processed++;
                    System.out.println("Processed: " + order.id());
                }
            }

            int getProcessedCount() { return processed; }
        }

        OrderProcessor processor = new OrderProcessor();
        for (Order order : orders) {
            processor.process(order);
        }
        System.out.println("Total processed: " + processor.getProcessedCount());
    }

    void sortWithComparator(List<String> names) {
        Comparator<String> byLength = new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return Integer.compare(a.length(), b.length());
            }
        };

        names.sort(byLength);
    }

    static class HttpClient {
        private final String baseUrl;
        private final int timeout;
        private final Map<String, String> headers;

        private HttpClient(Builder builder) {
            this.baseUrl = builder.baseUrl;
            this.timeout = builder.timeout;
            this.headers = builder.headers;
        }

        static class Builder {
            private String baseUrl;
            private int timeout = 30;
            private Map<String, String> headers = new HashMap<>();

            Builder(String baseUrl) { this.baseUrl = baseUrl; }

            Builder timeout(int timeout) {
                this.timeout = timeout;
                return this;
            }

            Builder header(String key, String value) {
                this.headers.put(key, value);
                return this;
            }

            HttpClient build() { return new HttpClient(this); }
        }
    }

    interface OrderEventListener {
        void onOrderCreated(Order order);
        void onOrderCancelled(Order order);
    }

    void registerListener(OrderEventListener listener) {
    }

    record Order(String id, boolean valid) {
        boolean isValid() { return valid; }
    }

    public static void main(String[] args) {
        NestedClassesDemo demo = new NestedClassesDemo();
        Connection conn = demo.new Connection("http://localhost:8080");

        ConnectionConfig config = new ConnectionConfig("localhost", 8080);
        System.out.println("Config: " + config.toUrl());

        HttpClient client = new HttpClient.Builder("http://api.example.com")
            .timeout(60)
            .header("Authorization", "Bearer token")
            .build();

        demo.sortWithComparator(new ArrayList<>(List.of("Charlie", "Alice", "Bob")));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Iterator implementation

public class Library {
    private List<Book> books = new ArrayList<>();

    // Return an anonymous class implementing Iterator
    public Iterator<Book> bookIterator() {
        return new Iterator<Book>() {
            private int index = 0;

            @Override
            public boolean hasNext() {
                return index < books.size();
            }

            @Override
            public Book next() {
                return books.get(index++);
            }
        };
    }
}

### Scenario 2: Thread with anonymous class

```java
public class Main {

    public static void main(String[] args) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println("Running in: " + Thread.currentThread().getName());
            }
        }).start();

        // Modern equivalent: lambda
        new Thread(() -> System.out.println("Running")).start();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Inner class holds outer reference | Memory leak if outer is large | Use static nested when possible |
| Forgetting `static` on nested class | Wastes memory with outer reference | Use static nested for helpers |
| Using anonymous class for complex logic | Hard to read and test | Extract to a named class or lambda |
| Accessing non-effectively-final variables | Compilation error in local/anonymous | Don't reassign captured variables |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/java/javaOO/index.html)
