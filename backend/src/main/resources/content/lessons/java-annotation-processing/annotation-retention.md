---
title: Annotation Retention and Targets — Where Annotations Live
summary: Understanding SOURCE, CLASS, and RUNTIME retention, ElementType targets, when to use each, and how the JVM handles annotation data at compile time vs runtime.
order: 2
minutes: 20
topics: [retention, target, source, class, runtime, element-type, annotation-metadata]
docs:
  - https://docs.oracle.com/javase/tutorial/java/annotations/declaring.html
---

## The Concept, From Zero

Every annotation you create needs two decisions:
1. **When should this annotation exist?** (retention)
2. **Where can this annotation be placed?** (target)

These two properties control whether a framework can see your annotation at runtime, or whether it's just a compile-time hint.

```java
@Retention(RetentionPolicy.RUNTIME)   // ← when does it exist?
@Target(ElementType.METHOD)          // ← where can it go?
public @interface MyAnnotation { }
```

---

## Retention Policies

### SOURCE — Compiler Eyes Only

The annotation is discarded after the compiler processes it. It never appears in the `.class` file.

```java
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.METHOD)
public @interface Override { }  // like the real @Override
```

**When to use:** Compile-time checks only. The compiler can warn you (e.g., "this method doesn't override anything"), but no framework can read it at runtime.

```java
@Override  // SOURCE retention — disappears after compilation
public String toString() { return "hello"; }
```

### CLASS — Bytecode but Not Runtime

The annotation is stored in the `.class` file but is NOT available via reflection. The JVM loads it into memory but doesn't expose it.

```java
@Retention(RetentionPolicy.CLASS)
@Target(ElementType.TYPE)
public @interface Internal { }
```

**When to use:** Static analysis tools (SpotBugs, SonarQube) that read bytecode. Spring does NOT use CLASS retention — it needs RUNTIME.

### RUNTIME — Visible Everywhere

The annotation is stored in the `.class` file AND is accessible via reflection at runtime. This is what Spring, JUnit, and Hibernate use.

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Cacheable { }
```

```java
// Spring can read this at runtime via reflection
@Cacheable("users")
public User findById(Long id) { ... }
```

---

## Line-by-Line Walkthrough

```java
import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class RetentionDemo {

    // SOURCE retention: only the compiler sees this
    @Retention(RetentionPolicy.SOURCE)
    @Target(ElementType.METHOD)
    @interface CompileCheck {
        String value();
    }

    // CLASS retention: bytecode has it, but reflection can't read it
    @Retention(RetentionPolicy.CLASS)
    @Target(ElementType.TYPE)
    @interface BytecodeMarker {
        String category();
    }

    // RUNTIME retention: fully visible via reflection
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface AuditLog {
        String action();
        boolean sensitive() default false;
    }

    // Usage
    @BytecodeMarker(category = "service")
    static class UserService {

        @CompileCheck("must override")
        @AuditLog(action = "find-user")
        public User findUser(Long id) {
            return new User(id, "Alice");
        }

        @AuditLog(action = "delete-user", sensitive = true)
        public void deleteUser(Long id) { }
    }

    static class User {
        Long id;
        String name;
        User(Long id, String name) { this.id = id; this.name = name; }
    }

    public static void main(String[] args) throws Exception {
        // SOURCE retention: gone — can't find it
        Method findMethod = UserService.class.getMethod("findUser", Long.class);
        CompileCheck cc = findMethod.getAnnotation(CompileCheck.class);
        System.out.println("CompileCheck at runtime: " + cc);  // null — gone!

        // RUNTIME retention: visible
        AuditLog audit = findMethod.getAnnotation(AuditLog.class);
        System.out.println("AuditLog action: " + audit.action());       // "find-user"
        System.out.println("AuditLog sensitive: " + audit.sensitive()); // false

        // CLASS retention: loaded but not via reflection
        BytecodeMarker bm = UserService.class.getAnnotation(BytecodeMarker.class);
        System.out.println("BytecodeMarker at runtime: " + bm);  // null — not via reflection
    }
}
```

---

## ElementType Targets

Controls WHERE an annotation can be placed:

```java
@Target(ElementType.TYPE)           // classes, interfaces, enums
@Target(ElementType.METHOD)         // methods
@Target(ElementType.FIELD)          // fields
@Target(ElementType.PARAMETER)      // method parameters
@Target(ElementType.CONSTRUCTOR)    // constructors
@Target(ElementType.LOCAL_VARIABLE) // local variables
@Target(ElementType.ANNOTATION_TYPE) // on other annotations
@Target(ElementType.PACKAGE)        // package-info.java
@Target(ElementType.RECORD_COMPONENT) // record components
@Target(ElementType.MODULE)         // module-info.java
```

### Multiple Targets

```java
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RestController { }  // can go on class OR method
```

### No @Target

If you omit `@Target`, the annotation can go **anywhere** — fields, methods, classes, parameters, etc. This is usually a mistake:

```java
@Retention(RetentionPolicy.RUNTIME)
public @interface Tag { }  // can go on ANYTHING — usually unintended
```

---

## Real-World Scenarios

### Scenario 1: Compile-time validation only

```java
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.METHOD)
public @interface NotNull {
    // This annotation is processed by a custom javac plugin
    // or IDE inspection — no runtime reflection needed
}
```

### Scenario 2: Framework configuration

```java
// Spring's @Transactional uses RUNTIME retention
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Transactional {
    Propagation propagation() default Propagation.REQUIRED;
    Isolation isolation() default Isolation.DEFAULT;
}
```

### Scenario 3: Bytecode instrumentation

```java
// JaCoCo uses CLASS retention for code coverage
@Retention(RetentionPolicy.CLASS)
@Target(ElementType.METHOD)
public @interface Generated {
    String value();
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using SOURCE for a Spring annotation | Spring can't see it at runtime | Use RUNTIME |
| Using RUNTIME for compile checks | Unnecessary memory overhead | Use SOURCE |
| Forgetting @Target | Annotation can be placed anywhere | Always specify valid targets |
| Putting RUNTIME annotation on local var | JVM doesn't store local var annotations in class file | Use FIELD or PARAMETER |
