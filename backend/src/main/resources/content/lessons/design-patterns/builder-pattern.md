---
title: Builder Pattern — Constructing Complex Objects Step by Step
module: design-patterns
order: 3
minutes: 24
topics: ["builder", "telescoping constructors", "fluent API", "immutability", "Lombok"]
docs:
  - title: "Builder (Refactoring Guru)"
    url: "https://refactoring.guru/design-patterns/builder"
---

# Builder Pattern — Constructing Complex Objects Step by Step

## The Concept: The Telescoping-Constructor Problem

Here's a real object that needs a lot of configuration: an `EmailMessage` with a recipient, subject, body, attachments, priority, and whether to track read receipts. How do you construct it?

**Option A — one constructor with all parameters:**

```java
new EmailMessage("a@b.com", "Hello", "Body...", null, null, Priority.HIGH, true, false);
```

Unreadable. Which `null` is the attachment? Which boolean is tracking? And if a field is optional, callers must pass `null`/`false` anyway. This is the **telescoping constructor** anti-pattern — constructors with ever-growing parameter lists (`(a)`, `(a,b)`, `(a,b,c)`, ...).

**Option B — setters after construction:**

```java
EmailMessage m = new EmailMessage();
m.setRecipient("a@b.com");
m.setSubject("Hello");
// ... but now the object can be mutated after creation, and
// a half-configured object can escape if you forget a required field.
```

**The Builder pattern** offers Option C: a separate *builder* object collects the settings through clear, named methods, and a final `build()` method creates the **immutable** result:

```java
EmailMessage m = EmailMessage.builder()
        .recipient("a@b.com")
        .subject("Hello")
        .priority(Priority.HIGH)
        .trackRead(true)
        .build();
```

Each method is named after the field (self-documenting), optional fields can be skipped, and the produced object can be immutable (final fields, no setters) — the builder is the *only* thing that assembles it.

## Why It's Worth It

1. **Readability** — the call reads like a sentence.
2. **Flexibility** — skip optional fields; order doesn't matter.
3. **Immutability** — the built object has no setters; safe to share.
4. **Validation at build time** — `build()` can check required fields and throw a clear error.
5. **Backward compatibility** — adding a field doesn't break existing callers (no constructor change).

## The Code Walkthrough

```java
import java.util.ArrayList;
import java.util.List;

class EmailMessage {

    // ---- Immutable fields: no setters, final ----
    private final String recipient;
    private final String subject;
    private final String body;
    private final List<String> attachments;
    private final Priority priority;
    private final boolean trackRead;

    enum Priority { LOW, NORMAL, HIGH }

    // ---- Private constructor: only the Builder can build ----
    private EmailMessage(Builder b) {
        this.recipient = b.recipient;
        this.subject = b.subject;
        this.body = b.body;
        this.attachments = List.copyOf(b.attachments);   // defensive copy
        this.priority = b.priority;
        this.trackRead = b.trackRead;
    }

    // ---- Getters ----
    public String recipient() { return recipient; }
    public List<String> attachments() { return attachments; }

    // ---- The static entry point ----
    public static Builder builder() { return new Builder(); }

    // ---- The Builder itself ----
    public static class Builder {
        private String recipient;        // required
        private String subject = "";     // defaults
        private String body = "";
        private List<String> attachments = new ArrayList<>();
        private Priority priority = Priority.NORMAL;
        private boolean trackRead = false;

        public Builder recipient(String r) { this.recipient = r; return this; }
        public Builder subject(String s)   { this.subject = s;   return this; }
        public Builder body(String b)      { this.body = b;      return this; }
        public Builder attachment(String a){ this.attachments.add(a); return this; }
        public Builder priority(Priority p){ this.priority = p;  return this; }
        public Builder trackRead(boolean t){ this.trackRead = t; return this; }

        public EmailMessage build() {
            if (recipient == null || recipient.isBlank()) {
                throw new IllegalStateException("recipient is required");
            }
            return new EmailMessage(this);
        }
    }
}

public class BuilderDemo {

    public static void main(String[] args) {
        EmailMessage msg = EmailMessage.builder()
                .recipient("student@example.com")
                .subject("Your certificate")
                .body("Congratulations on finishing the course!")
                .attachment("certificate.pdf")
                .priority(EmailMessage.Priority.HIGH)
                .trackRead(true)
                .build();

        System.out.println(msg.recipient());
        System.out.println(msg.attachments());   // [certificate.pdf]

        // Missing required field -> clear error at build time:
        try {
            EmailMessage.builder().subject("no recipient").build();
        } catch (IllegalStateException e) {
            System.out.println("caught: " + e.getMessage());
        }
    }
}
```

### Walking Through Each Part

**The immutable target** — all fields `final`, no setters, private constructor. The object, once built, cannot change. `List.copyOf` in the constructor makes a defensive copy so the caller can't mutate the internal list through a shared reference.

**`builder()`** — the static entry point. Convention: `ClassName.builder()` returns a fresh `Builder`. (With Lombok, this is generated for you by `@Builder`.)

**The `Builder` class** — mirrors the target's fields, but mutable. Each setter assigns and **returns `this`**, which is what enables method chaining — the fluent style. Because setters return the builder, you can keep calling methods without reassigning.

**`build()`** — the finishing step. It validates (recipient required), then constructs the target via the private constructor passing `this`. All validation lives in one place, and failures surface *at build time* with a clear message — not later with a `NullPointerException` three calls deep.

**The demo** — the fluent call reads like a specification. The optional fields (`attachment`, `trackRead`) were set; fields left unset fall back to the builder's defaults (`LOW`/`NORMAL`, `false`). Callers can skip any optional field without passing `null`.

## Builder vs Constructor vs Factory

| Approach | Readability | Immutability | Validation | Flexibility |
|---|---|---|---|---|
| Plain constructor | Poor with 4+ params | Yes | Poor | Adding a param breaks callers |
| Setters | Good | No (mutable) | Per-call | Good but unsafe |
| Builder | Excellent | Yes | Centralized in `build()` | Excellent |
| Factory | Good | Depends | In factory | Chooses *type*; doesn't assemble complex state |

The overlap to remember: **factory picks *which* type**; **builder assembles *one* complex object**. They're often combined (a factory method returns a builder, or a builder's `build()` uses a factory internally) — but their jobs are distinct.

## Builder in the Real World

- **`StringBuilder`** — a builder for strings (you met it in the strings module).
- **Spring's `UriComponentsBuilder`, `RestClient.builder()`, `SecurityFilterChain` DSL** — fluent configuration.
- **Jackson's `ObjectMapper`** — configured via builders.
- **Lombok `@Builder`** — generates all this boilerplate from one annotation; the pattern is so standard that codegen exists for it.

## Common Beginner Pitfalls

1. **Setters that don't return `this`** — chaining breaks (compile error). Always `return this;`.
2. **Forgetting `build()`** — you get a `Builder`, not the object; the type system usually catches it.
3. **Mutable fields escaping** — if the built object shares its list with the builder, later builder mutations leak in; defensive-copy in the constructor.
4. **Validation scattered** — keep it in `build()`; that's the whole point.
5. **Using the builder for 2-field objects** — over-engineering. The pattern pays off at ~4+ fields or when fields are optional in many combinations.
6. **Making the builder's fields final** — the builder must be *mutable*; only the *built* object is immutable.

## Key Takeaways

- Builder solves the telescoping-constructor problem with named, chainable setters.
- Each setter returns `this` for fluent chaining; `build()` validates and creates the immutable object.
- The built object has final fields and no setters — safe to share.
- Factory chooses the *type*; Builder assembles the *instance*.
- Lombok's `@Builder` generates the pattern; `StringBuilder` is a builder you already use.
