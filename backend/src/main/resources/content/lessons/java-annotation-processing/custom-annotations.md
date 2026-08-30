---
title: Custom Annotations — Metadata for Your Code
summary: What annotations are, how to create custom ones, annotation retention, targets, processing with reflection, and how organizations use annotations for frameworks.
order: 1
minutes: 25
topics: [annotations, custom-annotations, retention, target, reflection, annotation-processing]
docs:
  - https://docs.oracle.com/javase/tutorial/java/annotations/
---

## The Concept, From Zero

Annotations are metadata you attach to code. They don't do anything by themselves — they need a processor (like Spring, JUnit, or your own reflection code) to act on them:

```java
// Built-in annotations you already use
@Override      // Compiler check: this method overrides a parent
@FXML          // JavaFX: inject a UI element
@Test          // JUnit: mark a test method

// Custom annotations YOU can create
@RateLimited(limit = 100, window = 60)  // Custom: rate limit this endpoint
@Cached(ttl = 300)                       // Custom: cache this method's result
@Audited                              // Custom: log this operation for compliance
```

---

## Creating Custom Annotations

```java
// Step 1: Define the annotation
import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)   // Keep at runtime (accessible via reflection)
@Target(ElementType.METHOD)          // Can only be placed on methods
public @interface RateLimited {
    int limit();                      // Required parameter
    long window() default 60;         // Optional parameter with default
    String key() default "";          // Optional parameter
}

// Step 2: Use it
@RateLimited(limit = 100, window = 60)
public ResponseEntity<?> handleRequest() {
    // ...
}

// Step 3: Process it (via reflection)
Method method = controller.getClass().getMethod("handleRequest");
RateLimited annotation = method.getAnnotation(RateLimited.class);
int limit = annotation.limit();       // 100
long window = annotation.window();   // 60
```

---

## Retention Policies

```java
@Retention(RetentionPolicy.SOURCE)   // Discarded after compilation (like @Override)
@Retention(RetentionPolicy.CLASS)    // Kept in .class file but not at runtime
@Retention(RetentionPolicy.RUNTIME)  // Kept at runtime (accessible via reflection)
```

## Targets

```java
@Target(ElementType.TYPE)        // Classes, interfaces, enums
@Target(ElementType.METHOD)      // Methods
@Target(ElementType.FIELD)       // Fields
@Target(ElementType.PARAMETER)   // Method parameters
@Target(ElementType.CONSTRUCTOR) // Constructors
@Target(ElementType.LOCAL_VARIABLE) // Local variables
@Target({ElementType.TYPE, ElementType.METHOD}) // Multiple targets
```

---

## Line-by-Line Walkthrough

```java
import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class CustomAnnotationsDemo {
    // Line 1: Define a custom annotation for validation
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.FIELD)
    public @interface NotBlank {
        String message() default "Field cannot be blank";
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.FIELD)
    public @interface Range {
        int min() default 0;
        int max() default Integer.MAX_VALUE;
        String message() default "Value out of range";
    }

    // Line 2: Define a custom annotation for caching
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    public @interface Cached {
        int ttlSeconds() default 300;  // time to live
        String key() default "";       // cache key
    }

    // Line 3: Define a custom annotation for auditing
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    public @interface Audited {
        String action();               // what action is being performed
        boolean logParams() default false;  // whether to log parameters
    }

    // Line 4: Use the annotations
    static class User {
        @NotBlank(message = "Name is required")
        private String name;

        @Range(min = 0, max = 150, message = "Age must be between 0 and 150")
        private int age;

        @NotBlank(message = "Email is required")
        private String email;

        User(String name, int age, String email) {
            this.name = name;
            this.age = age;
            this.email = email;
        }
    }

    // Line 5: Annotation processor using reflection
    static class Validator {
        public static List<String> validate(Object obj) throws IllegalAccessException {
            List<String> errors = new ArrayList<>();
            Class<?> clazz = obj.getClass();

            for (Field field : clazz.getDeclaredFields()) {
                field.setAccessible(true);
                Object value = field.get(obj);

                // Check @NotBlank
                NotBlank notBlank = field.getAnnotation(NotBlank.class);
                if (notBlank != null) {
                    if (value == null || value.toString().isBlank()) {
                        errors.add(field.getName() + ": " + notBlank.message());
                    }
                }

                // Check @Range
                Range range = field.getAnnotation(Range.class);
                if (range != null && value instanceof Integer intValue) {
                    if (intValue < range.min() || intValue > range.max()) {
                        errors.add(field.getName() + ": " + range.message());
                    }
                }
            }
            return errors;
        }
    }

    // Line 6: Cache annotation processor
    static Map<String, Object> cache = new HashMap<>();

    public static <T> T getCachedResult(String key, int ttl, java.util.function.Supplier<T> supplier) {
        String cacheKey = key;
        if (cache.containsKey(cacheKey)) {
            return (T) cache.get(cacheKey);
        }
        T result = supplier.get();
        cache.put(cacheKey, result);
        return result;
    }

    // Line 7: Audit annotation processor
    public static void auditMethod(Object obj, String methodName, Object... args) throws Exception {
        Method method = obj.getClass().getMethod(methodName);
        Audited audited = method.getAnnotation(Audited.class);

        if (audited != null) {
            System.out.println("[AUDIT] Action: " + audited.action());
            if (audited.logParams()) {
                System.out.println("[AUDIT] Parameters: " + Arrays.toString(args));
            }
        }
    }

    public static void main(String[] args) throws Exception {
        // Line 8: Test validation
        User validUser = new User("Alice", 30, "alice@example.com");
        User invalidUser = new User("", 200, "");

        List<String> validErrors = Validator.validate(validUser);
        List<String> invalidErrors = Validator.validate(invalidUser);

        System.out.println("Valid user errors: " + validErrors);    // []
        System.out.println("Invalid user errors: " + invalidErrors); // [name: ..., age: ..., email: ...]

        // Line 9: Test cache annotation
        System.out.println("@Cached annotation found: " +
            DemoService.class.getMethod("getData").isAnnotationPresent(Cached.class));

        // Line 10: Test audit annotation
        System.out.println("@Audited annotation found: " +
            DemoService.class.getMethod("processOrder").isAnnotationPresent(Audited.class));
    }

    static class DemoService {
        @Cached(ttlSeconds = 600, key = "data")
        public String getData() { return "data"; }

        @Audited(action = "process-order", logParams = true)
        public void processOrder(String orderId) { }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Custom validation framework

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface Email {
    String message() default "Invalid email format";
}

// Process with reflection
public static boolean isValidEmail(Object obj) throws IllegalAccessException {
    for (Field field : obj.getClass().getDeclaredFields()) {
        Email email = field.getAnnotation(Email.class);
        if (email != null) {
            String value = (String) field.get(obj);
            if (value == null || !value.matches("^[\\w.-]+@[\\w.-]+\\.\\w{2,}$")) {
                return false;
            }
        }
    }
    return true;
}
```

### Scenario 2: AOP-based audit logging

```java
@Aspect
@Component
public class AuditAspect {
    @Around("@annotation(audited)")
    public Object audit(ProceedingJoinPoint joinPoint, Audited audited) throws Throwable {
        String action = audited.action();
        String user = SecurityContextHolder.getContext().getAuthentication().getName();

        log.info("User {} performing action: {}", user, action);
        Object result = joinPoint.proceed();
        log.info("Action {} completed successfully", action);

        auditLogRepository.save(new AuditLog(user, action, Instant.now()));
        return result;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using SOURCE retention | Not available at runtime | Use RUNTIME for reflection-based processing |
| Forgetting `@Target` | Annotation can be placed anywhere | Specify valid targets |
| Not handling null values | NullPointerException in processor | Check for null before accessing annotation |
| Over-annotating | Code becomes noisy | Only annotate where it adds value |
| Using annotations for logic | Annotations are metadata, not code | Process annotations in frameworks/tools |
