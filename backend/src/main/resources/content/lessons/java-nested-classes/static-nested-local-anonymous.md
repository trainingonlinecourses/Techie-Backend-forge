---
title: Static Nested, Local, and Anonymous Classes — All Three Explained
summary: Static nested classes for helpers without outer references, local classes for method-specific logic, and anonymous classes for one-time implementations — when to use each.
order: 4
minutes: 24
topics: [static-nested, local-class, anonymous-class, lambda-replacement, callback]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/index.html
---

## The Concept, From Zero

Java has 4 types of nested classes. We covered inner classes (non-static). Now let's look at the other three:

| Type | Syntax | Outer Reference | Use Case |
|------|--------|-----------------|----------|
| **Static nested** | `static class Nested {}` | No | Helper that doesn't need outer |
| **Local** | Defined inside a method | Effectively final locals | Method-specific logic |
| **Anonymous** | `new Interface() { ... }` | Effectively final locals | One-time implementations |

---

## Static Nested Classes


**What this code does — step by step:**

1. Static nested class — no reference to outer instance
2. Can access static members of outer
3. No outer instance needed!
4. `System.out.println("Area: " + calc.area());` — 78.54
5. `System.out.println("Circumference: " + calc.circumference());` — 31.42

The same code, clean:

```java
public class MathUtils {
    private static final double PI = 3.14159;

    public static class Calculator {
        private double radius;

        public Calculator(double radius) {
            this.radius = radius;
        }

        public double area() {
            return PI * radius * radius;
        }

        public double circumference() {
            return 2 * PI * radius;
        }
    }

    public static void main(String[] args) {
        MathUtils.Calculator calc = new MathUtils.Calculator(5.0);
        System.out.println("Area: " + calc.area());
        System.out.println("Circumference: " + calc.circumference());
    }
}
```

---

## Local Classes

import java.util.ArrayList;
import java.util.List;
import java.util.Comparator;

public class StringProcessor {
    
    public List<String> processStrings(List<String> input) {
        // Local class — defined inside a method
        class Processor {
            String prefix;
            String suffix;
            
            Processor(String prefix, String suffix) {
                this.prefix = prefix;
                this.suffix = suffix;
            }
            
            String process(String s) {
                return prefix + s.toUpperCase() + suffix;
            }
            
            boolean matches(String s) {
                return s.startsWith(prefix) && s.endsWith(suffix);
            }
        }
        
        // Use local class
        Processor processor = new Processor("[", "]");
        List<String> result = new ArrayList<>();
        
        for (String s : input) {
            if (processor.matches(s)) {
                result.add(processor.process(s));
            }
        }
        
        return result;
    }
    
    public static void main(String[] args) {
        StringProcessor sp = new StringProcessor();
        List<String> data = List.of("[hello]", "[world]", "test", "[java]");
        
        List<String> processed = sp.processStrings(data);
        System.out.println(processed);  // [[HELLO], [WORLD], [JAVA]]
    }
}

---

## Anonymous Classes


**What this code does — step by step:**

1. Line 1: Anonymous class implementing Runnable
2. Line 2: Anonymous class extending abstract class
3. Line 3: Anonymous class implementing Comparator
4. `return a.length() - b.length();` — Sort by length
5. `System.out.println(names);` — [Bob, Alice, Charlie]

The same code, clean:

```java
import java.util.*;

public class AnonymousClassDemo {

    public static void main(String[] args) {
        Runnable task = new Runnable() {
            @Override
            public void run() {
                System.out.println("Running in anonymous class");
            }
        };
        task.run();

        abstract class Shape {
            abstract double area();
            abstract String describe();
        }

        Shape circle = new Shape() {
            double radius = 5.0;

            @Override
            double area() {
                return Math.PI * radius * radius;
            }

            @Override
            String describe() {
                return "Circle with area " + area();
            }
        };
        System.out.println(circle.describe());

        List<String> names = new ArrayList<>(Arrays.asList("Charlie", "Alice", "Bob"));

        Collections.sort(names, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return a.length() - b.length();
            }
        });
        System.out.println(names);
    }
}
```

---

## When to Use Each Type

### Static Nested: Helper classes that don't need outer

public class OrderService {
    // Static nested — no outer reference needed
    public static class OrderValidator {
        public boolean validate(Order order) {
            return order.getItems() != null && !order.getItems().isEmpty();
        }
    }
    
    public static class OrderFormatter {
        public String format(Order order) {
            return String.format("Order #%d: %s", order.getId(), order.getStatus());
        }
    }
    
    // Usage
    public void processOrder(Order order) {
        OrderValidator validator = new OrderValidator();
        if (validator.validate(order)) {
            OrderFormatter formatter = new OrderFormatter();
            System.out.println(formatter.format(order));
        }
    }
}

### Local: Method-specific logic

public class DataProcessor {
    
    public List<Employee> findTopEarners(List<Employee> employees, double threshold) {
        // Local class for this specific filter
        class HighEarnerFilter {
            boolean matches(Employee e) {
                return e.getSalary() >= threshold;
            }
            
            String format(Employee e) {
                return String.format("%s: $%.2f", e.getName(), e.getSalary());
            }
        }
        
        HighEarnerFilter filter = new HighEarnerFilter();
        return employees.stream()
            .filter(filter::matches)
            .toList();
    }
}

### Anonymous: One-time implementations

public class EventSystem {
    
    public void setupListeners() {
        // Anonymous class for one-time button handler
        Button saveButton = new Button("Save");
        saveButton.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                System.out.println("Save clicked!");
            }
        });
        
        // Anonymous class for custom thread
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println("Working in background");
            }
        });
        worker.start();
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Anonymous class too complex | Hard to read | Use lambda or named class |
| Local class accessing non-final | Compile error | Use effectively final variables |
| Static nested accessing instance | Compile error | Make it static or use inner class |
| Anonymous class in loops | Unexpected behavior | Use lambda or named class |
| Memory leak from anonymous class | Holds outer reference | Use static nested or lambda |

---

## Modern Alternatives


**What this code does — step by step:**

1. Before Java 8: Anonymous class
2. Java 8+: Lambda (for functional interfaces)
3. Before Java 8: Anonymous Comparator
4. Java 8+: Lambda
5. Java 7+: Method reference

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Runnable task = new Runnable() {
            @Override
            public void run() {
                System.out.println("Hello");
            }
        };

        Runnable task = () -> System.out.println("Hello");

        Comparator<String> comp = new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return a.length() - b.length();
            }
        };

        Comparator<String> comp = (a, b) -> a.length() - b.length();

        Comparator<String> comp = Comparator.comparingInt(String::length);
    }
}
```

