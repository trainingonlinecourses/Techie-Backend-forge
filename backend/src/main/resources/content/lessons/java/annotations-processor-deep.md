---
title: Java Annotations Deep — Meta-annotations and Annotation Processing
summary: Annotation retention policies, target elements, meta-annotations like @Inherited and @Repeatable, writing custom annotations with annotation processors, and how Spring uses annotations to power its entire framework.
order: 53
minutes: 22
topics: [annotations, meta-annotations, retention-policy, annotation-processor, compile-time-processing, source-generation]
docs:
  - https://docs.oracle.com/javase/tutorial/java/annotations/index.html
  - https://docs.oracle.com/javase/8/docs/api/java/lang/annotation/package-summary.html
---

# Java Annotations Deep — Meta-annotations and Annotation Processing

## The concept

An **annotation** is a form of metadata. It does not directly affect program execution — it provides information that can be read by tools, frameworks, or the compiler at compile time or runtime. Think of annotations as labels that you attach to classes, methods, or fields, which other code can inspect to make decisions.

```java
@Override  // This is an annotation — tells the compiler "this method overrides a superclass method"
public String toString() {
    return "User{...}";
}
```

Java annotations come in three flavors:

1. **Built-in annotations** — `@Override`, `@SuppressWarnings`, `@Deprecated`. The compiler uses these directly.
2. **Framework annotations** — `@SpringBootApplication`, `@Entity`, `@Transactional`. Spring, JPA, and other frameworks read these at runtime to change behavior.
3. **Custom annotations** — Annotations you define yourself. You write an annotation processor that reads them and generates code, validates structure, or modifies behavior.

## The anatomy of a custom annotation

```java
@Target(ElementType.METHOD)           // Where can this annotation be placed?
@Retention(RetentionPolicy.RUNTIME)   // When is it available?
@Inherited                            // Do subclasses inherit this?
public @interface Auditable {
    String value() default "";         // annotation element with default value
    int priority() default 0;
    boolean sensitive() default false;
}
```

**@Target** — Controls where the annotation can be placed:
- `TYPE` — Class, interface, enum
- `METHOD` — Methods only
- `FIELD` — Fields only
- `PARAMETER` — Method parameters
- `CONSTRUCTOR` — Constructors
- `PACKAGE` — Package declarations

**@Retention** — Controls when the annotation is available:
- `SOURCE` — Discarded after compilation (e.g., `@Override`). The compiler reads it but the bytecode does not contain it.
- `CLASS` — Available in the `.class` file but not at runtime. Rarely used.
- `RUNTIME` — Available via reflection at runtime. This is what frameworks use.

**@Inherited** — If present, a subclass inherits the annotation from its superclass. Does NOT work with interface implementations.

**@Repeatable** — Allows the same annotation to be placed multiple times on the same element.

## How we use it in organizations

### Scenario 1: Audit trail annotations

Mark any service method for automatic audit logging:

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Auditable {
    String action();  // e.g., "USER_CREATE", "ORDER_CANCEL"
    boolean sensitive() default false;
}
```

```java
@Component
public class UserService {
    @Auditable(action = "USER_CREATE")
    public User createUser(CreateUserRequest request) {
        // ... create user logic
    }

    @Auditable(action = "PASSWORD_CHANGE", sensitive = true)
    public void changePassword(String userId, String newPassword) {
        // ... password change logic
    }
}
```

```java
@Aspect
@Component
public class AuditAspect {
    private final AuditLogRepository auditRepo;

    @Around("@annotation(auditable)")
    public Object audit(ProceedingJoinPoint joinPoint, Auditable auditable) throws Throwable {
        String method = joinPoint.getSignature().toShortString();
        Instant start = Instant.now();
        try {
            Object result = joinPoint.proceed();
            auditRepo.save(new AuditEntry(
                auditable.action(), method, "SUCCESS",
                start, Instant.now(), auditable.sensitive() ? "[REDACTED]" : toJson(joinPoint.getArgs())
            ));
            return result;
        } catch (Exception ex) {
            auditRepo.save(new AuditEntry(
                auditable.action(), method, "FAILED",
                start, Instant.now(), ex.getMessage()
            ));
            throw ex;
        }
    }
}
```

### Scenario 2: Custom validation annotations

Create domain-specific validations that Spring automatically enforces:

```java
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PhoneNumberValidator.class)
public @interface PhoneNumber {
    String message() default "Invalid phone number format";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

```java
public class PhoneNumberValidator implements ConstraintValidator<PhoneNumber, String> {
    private static final Pattern PHONE = Pattern.compile("^\\+?[1-9]\\d{6,14}$");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || PHONE.matcher(value).matches();  // null = optional
    }
}
```

```java
public class ContactDto {
    @NotBlank(message = "Name is required")
    private String name;

    @PhoneNumber
    private String phone;  // validated by our custom annotation
}
```

### Scenario 3: Annotation processing at compile time

Generate boilerplate code during compilation using annotation processors:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.SOURCE)
public @interface Builder {
    // Marker annotation — no elements
}
```

```java
// An annotation processor generates a Builder class at compile time
@SupportedAnnotationTypes("com.app.Builder")
@SupportedSourceVersion(SourceVersion.RELEASE_21)
public class BuilderProcessor extends AbstractProcessor {

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        for (Element element : roundEnv.getElementsAnnotatedWith(Builder.class)) {
            TypeElement typeElement = (TypeElement) element;
            generateBuilderClass(typeElement);
        }
        return true;  // we've handled these annotations
    }

    private void generateBuilderClass(TypeElement typeElement) {
        // Generate a Builder.java file alongside the original class
        // This is how Lombok's @Builder works internally
    }
}
```

**Annotation processors run at compile time.** They read annotations from source files and generate new source files (or resource files). This is how Lombok, MapStruct, and Dagger work.

### Scenario 4: Thread-safety annotations

Document thread-safety contracts that static analysis tools can verify:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface ThreadSafe {
    String value() default "";  // description of thread-safety strategy
}
```

```java
@ThreadSafe("Synchronized on 'this' for all public methods")
public class ThreadSafeCounter {
    private int count = 0;

    public synchronized int increment() {
        return ++count;
    }

    public synchronized int getCount() {
        return count;
    }
}
```

Tools like SpotBugs can read `@ThreadSafe` and `@NotThreadSafe` annotations to flag potential race conditions.

### Scenario 5: Configuration annotations

Create your own mini-framework annotations:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface ScheduledJob {
    String cron();
    String description() default "";
    boolean enabled() default true;
}
```

```java
@ScheduledJob(cron = "0 0 2 * * ?", description = "Daily data sync")
public class DailySyncJob implements Job {
    @Override
    public void execute(JobContext context) {
        // sync logic
    }
}
```

```java
@Component
public class JobScheduler {
    @PostConstruct
    public void registerJobs() {
        // Scan all classes with @ScheduledJob and register them
        // with Spring's TaskScheduler
    }
}
```

## The annotation hierarchy

```
java.lang.annotation.Annotation (root)
├── @Documented     — Include in Javadoc
├── @Inherited      — Subclasses inherit
├── @Repeatable     — Can appear multiple times
├── @Retention      — SOURCE / CLASS / RUNTIME
├── @Target         — TYPE / METHOD / FIELD / etc.
└── @Native         — Field is accessed by native code
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using RUNTIME retention when SOURCE is enough | Wasted memory, reflection overhead |
| Not handling `null` in annotation processors | `NullPointerException` at compile time |
| Placing annotations on wrong target elements | Compile error or silent ignored annotation |
| Over-annotating (every class, every method) | Code becomes unreadable, annotation fatigue |
| Using annotations to replace all if/else logic | Runtime reflection makes code hard to follow |
| Not testing annotation processors | Generated code breaks silently |
