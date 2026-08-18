---
title: Annotations Deep — Metadata the Compiler and Frameworks Read
module: java-reflection-annotations
order: 2
minutes: 25
topics: ["annotations", "retention", "target", "custom annotations", "annotation processing"]
docs:
  - title: "Annotations (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/annotations/index.html"
  - title: "Declaring an Annotation Type (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/annotations/declaring.html"
---

# Annotations Deep — Metadata the Compiler and Frameworks Read

## The Concept: Labels That Change Behavior

An **annotation** is metadata attached to code — a label on a class, method, field, or parameter. By itself, an annotation does *nothing*: it's inert data. Its power comes from the *consumers* — the compiler, annotation processors, and runtime frameworks that read it and change behavior accordingly.

**The mental model:** an annotation is a sticky note on a piece of code. The sticky note doesn't change the code — but the *person who reads it* (Spring at startup, the compiler during build, a linter) changes what they do with the code. `@Override` tells the compiler "this should override a parent method — check it." `@Transactional` tells Spring "wrap this method in a transaction." The annotation is the message; the framework is the reader.

This is the single most important idea in modern Java: **frameworks like Spring are annotation-driven**. When you write `@RestController`, `@Service`, `@Autowired`, `@GetMapping`, you're not calling framework code — you're *labeling* your code, and Spring's machinery reads the labels at startup and wires everything up. Understanding annotations is understanding how Spring works.

## The Three Places an Annotation Can Live: Retention

Every annotation has a **retention policy** — how long the label survives:

```java
import java.lang.annotation.*;

// SOURCE: discarded by the compiler. Only visible in the source file.
@Retention(RetentionPolicy.SOURCE)
@interface SourceOnly { }

// CLASS: stored in the .class file, but NOT readable at runtime.
// (The default.) Used by bytecode tools, not by your running app.
@Retention(RetentionPolicy.CLASS)
@interface ClassOnly { }

// RUNTIME: stored in the class file AND readable via reflection at runtime.
// This is what frameworks use.
@Retention(RetentionPolicy.RUNTIME)
@interface RuntimeOnly { }
```

**Why retention matters:** `@Override` and `@SuppressWarnings` are `SOURCE` — the compiler reads them, then discards them; keeping them at runtime would waste memory for zero benefit. `@FunctionalInterface` is also `SOURCE` — it only guides the compiler. Spring's annotations (`@Service`, `@Transactional`, `@GetMapping`) are `RUNTIME` — Spring's `ApplicationContext` reads them with reflection *while your app runs*. If you write a custom annotation your framework needs to see at runtime, it must be `RUNTIME`; this is the most common annotation bug.

## Where It Can Be Applied: Target

The `@Target` meta-annotation restricts where an annotation may appear:

```java
import java.lang.annotation.*;

// This annotation may only appear on methods (and constructors).
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited { }

// This one may appear on types (classes/interfaces/enums/records).
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface Entity { }

// Multiple targets: fields and parameters, for example.
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface NotNull { }
```

The common `ElementType` values: `TYPE` (classes/interfaces/records/enums), `METHOD`, `FIELD`, `PARAMETER`, `CONSTRUCTOR`, `LOCAL_VARIABLE`, `ANNOTATION_TYPE` (meta-annotations like `@Target` themselves), `PACKAGE`, and `TYPE_USE` (which allows annotations in generic type arguments, e.g. `List<@NotNull String>`).

## Writing Your Own Annotation, From Scratch

Let's build a real one — a `@RateLimit` annotation that Spring could read to enforce API rate limits:

```java
import java.lang.annotation.*;

@Target(ElementType.METHOD)          // put it on controller methods
@Retention(RetentionPolicy.RUNTIME)  // Spring must see it at runtime
public @interface RateLimit {

    // Elements look like methods; they become annotation parameters.
    int maxRequests() default 100;      // how many calls allowed

    String window() default "1m";       // per what window: "1m", "1h"

    // A "marker" style: just the presence of the annotation matters.
    // (If you add elements, all must have defaults or be provided.)
}
```

**Using it:**

```java
@RestController
public class PaymentController {

    @RateLimit(maxRequests = 10, window = "1s")   // override defaults
    @PostMapping("/charge")
    public void charge() { /* ... */ }

    @RateLimit                                 // defaults: 100 per 1m
    @GetMapping("/history")
    public void history() { /* ... */ }
}
```

**Reading it with reflection** — the framework side:

```java
import java.lang.reflect.Method;

public class RateLimitProcessor {
    public static void main(String[] args) throws Exception {
        Method charge = PaymentController.class.getMethod("charge");
        Method history = PaymentController.class.getMethod("history");

        // isAnnotationPresent: fast check before doing work.
        if (charge.isAnnotationPresent(RateLimit.class)) {
            RateLimit rl = charge.getAnnotation(RateLimit.class);
            System.out.println("charge: " + rl.maxRequests() +
                               " requests per " + rl.window());
            // -> charge: 10 requests per 1s
        }
        if (history.isAnnotationPresent(RateLimit.class)) {
            RateLimit rl = history.getAnnotation(RateLimit.class);
            System.out.println("history: " + rl.maxRequests() +
                               " per " + rl.window());
            // -> history: 100 per 1m
        }
    }
}
```

**Walking through it:** the annotation's "methods" are its *elements* — `maxRequests()` and `window()` — with `default` values so callers can override selectively. The processor uses `isAnnotationPresent` to check for the label and `getAnnotation` to read the values. This is *exactly* the pattern Spring's machinery runs a thousand times at startup: scan for annotated classes/methods, read their metadata, and build the framework's behavior around it.

## The Meta-Annotations: Annotations About Annotations

`@Target`, `@Retention`, `@Documented`, `@Inherited`, and `@Repeatable` are themselves annotations — the meta-annotations that define how other annotations behave. Two you'll want in your own declarations:

- `@Documented` — include this annotation in generated Javadoc.
- `@Inherited` — if a superclass is annotated, subclasses inherit the annotation (only works for `TYPE`-targeted annotations). Spring's `@Service` etc. use it so subclassed beans stay discoverable.
- `@Repeatable` — allow the annotation to appear multiple times (e.g., multiple `@Path` declarations).

## Annotation Processing: The Compile-Time Superpower

Annotations aren't only runtime — they can be consumed **at compile time** by *annotation processors*. A processor runs during `javac` and can generate source files, check code, or emit diagnostics. The famous examples:

- **Lombok**: `@Getter`, `@Slf4j`, `@Builder` are processed at compile time to generate the boilerplate methods *into your compiled class*. This is why Lombok's getters exist in bytecode but not in your source file.
- **Spring Boot configuration processors**: generate metadata for `@ConfigurationProperties` so your IDE can autocomplete `application.properties` keys.
- **AutoService / Dagger / etc.**: generate service registrations and DI code.

A processor is registered via `META-INF/services/javax.annotation.processing.Processor` and gets invoked by the compiler. This is a different (and faster, and earlier) consumption model than runtime reflection — if your annotation's behavior can be resolved at build time, processing beats reflection.

## Annotation vs Interface: Don't Be Confused

An annotation *type* (`@interface`) looks like an interface but isn't: its members are called elements, can only return primitives, `String`, `Class`, enums, other annotations, or arrays of these — never objects with behavior. And critically, an annotation type is **instantiated by the runtime**, not by you: there's no `new RateLimit()`. The JVM/compiler fabricates the implementation when it reads the label. Don't try to give annotations logic; they're data.

## Recap

Annotations are metadata labels that do nothing by themselves — their power is in the readers: the compiler (`@Override`, `@SuppressWarnings`), annotation processors (Lombok's code generation), and runtime frameworks (Spring's entire wiring model). Three decisions define your annotation: **retention** (SOURCE/CLASS/RUNTIME — must be RUNTIME for frameworks), **target** (where it can sit), and its **elements** (parameters with defaults). Reading them is a simple reflection pattern: `isAnnotationPresent` + `getAnnotation`. Master annotations and you stop seeing Spring as magic and start seeing it as a metadata reader — your `@Service`, `@Transactional`, and `@GetMapping` labels are just data, and the framework is the machinery that acts on them.
