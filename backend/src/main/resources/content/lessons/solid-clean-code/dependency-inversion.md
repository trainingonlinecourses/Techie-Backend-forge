---
title: DIP — Dependency Inversion Principle
module: solid-clean-code
order: 5
minutes: 25
topics: ["DIP", "dependency injection", "abstractions", "high-level vs low-level", "Spring IoC"]
summary: The Dependency Inversion Principle (the D in SOLID) has two rules:
docs:
  - title: "Dependency inversion principle (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Dependency_inversion_principle"
---

# DIP — Dependency Inversion Principle

## The Concept: Point Dependencies at Abstractions, Not Concrete Details

The **Dependency Inversion Principle** (the *D* in SOLID) has two rules:

1. **High-level modules should not depend on low-level modules. Both should depend on abstractions.**
2. **Abstractions should not depend on details. Details should depend on abstractions.**

Decoded: your *business logic* (high level — "what the app does") should not directly reference your *infrastructure* (low level — "how it does it": the database, the SMTP server, the file system). Both should reference an **interface**. The "inversion" is the direction of dependency: instead of business code depending *down* onto concrete implementations, the *implementations* depend *up* onto the business-defined interface.

The payoff: swap the database, the email provider, or the payment gateway **without touching business logic**. The business code depends on `UserRepository` (an interface it defines); whether the implementation is JPA, JDBC, or an in-memory fake for tests is invisible to it.

## The Violation — Business Logic Glued to Infrastructure

```java
// HIGH-LEVEL business logic, tightly coupled to a LOW-LEVEL detail:
class UserService {
    // Direct dependency on a concrete class — and its constructor!
    private final PostgresUserRepository repository = new PostgresUserRepository(
            "jdbc:postgresql://db/prod", "admin", "secret");

    void register(String email) {
        repository.save(new User(email));
    }
}
```

Problems:

- `UserService` **hard-codes** the database (type, URL, credentials) into itself.
- Testing `UserService` means having a real Postgres — no fakes.
- Switching to MongoDB means **editing business logic**.
- The dependency arrow points *down*: high-level → low-level. That's the "inversion" that must be fixed.

## The Fix — Depend on an Abstraction the Business Defines

```java
// 1. The abstraction — defined by the HIGH-LEVEL module's need:
interface UserRepository {
    void save(User user);
    User findById(long id);
}

// 2. A low-level implementation — depends UP on the interface:
class PostgresUserRepository implements UserRepository {
    private final DataSource dataSource;      // injected, not constructed inside

    PostgresUserRepository(DataSource ds) { this.dataSource = ds; }

    public void save(User user)   { /* JDBC/JPA against dataSource */ }
    public User findById(long id) { /* ... */ }
}

// 3. Business logic — depends on the abstraction, receives it:
class UserService {
    private final UserRepository repository;    // interface, injected

    UserService(UserRepository repository) { this.repository = repository; }

    void register(String email) {
        repository.save(new User(email));
    }
}

// 4. Wiring happens at ONE place (composition root) — not inside business code:
public class App {
    public static void main(String[] args) {
        DataSource ds = createProdDataSource();                  // infra setup
        UserRepository repo = new PostgresUserRepository(ds);    // concrete choice
        UserService service = new UserService(repo);             // business gets abstraction
        service.register("student@example.com");
    }
}
```

### What Changed and Why

- **`UserService` depends on `UserRepository` (interface), not on Postgres** — the dependency arrow now points *up* from the implementation to the abstraction. That's the inversion.
- **The concrete choice lives in the composition root** — the one place that knows "we use Postgres" is `App.main` (in Spring: the container/`@Configuration`). Business logic is database-agnostic.
- **Testing is trivial** — supply an in-memory fake:

```java
UserRepository fake = new UserRepository() {
    public void save(User u) { saved.add(u); }
    public User findById(long id) { return null; }
};
UserService service = new UserService(fake);   // test the rules, no DB
```

- **Swapping infrastructure** (Postgres → MongoDB, SMTP → SendGrid, file storage → S3) = new implementation class + new wiring line. `UserService` never changes.

## DIP vs Dependency Injection (Don't Confuse Them)

- **DIP** is the *principle*: depend on abstractions, not concretions.
- **DI** (dependency injection) is the *technique* that implements it: pass dependencies in (constructor) instead of creating them inside.

You can do DI without DIP (injecting a concrete class still couples you) and DIP without a framework (hand-wired, as in `App.main` above). Best practice is both: DIP for the design, constructor injection for the mechanism.

## DIP in Spring — The Whole Point of the Container

```java
// Business logic depends on the interface:
@Service
class UserService {
    private final UserRepository repository;

    UserService(UserRepository repository) { this.repository = repository; }   // constructor injection
}

// Implementation is a bean — Spring wires it in:
@Repository
interface UserRepository extends JpaRepository<User, Long> { }   // or a class implementing the interface

// In tests, swap the implementation with @MockBean/@TestConfiguration — business code untouched.
```

Spring *is* the composition root: `@Configuration`/component scanning decides which concrete bean fills which interface, and constructor injection hands it to the business code. Changing the implementation = changing a bean definition (or a profile), never editing services. This is DIP made operational, at scale.

## When It's Not Worth It

DIP costs indirection: every abstraction is a layer. Judgment calls:

- **Use the abstraction when** the implementation may vary (DB choice, external API, third-party vendor) or must be faked in tests.
- **Skip it when** the "dependency" is a stable JDK class (`List`, `String`, `LocalDate`) or a genuinely fixed internal utility. Don't write `interface StringHelper` — you're not going to swap `String`.

The pragmatic signal: **would you ever have a second implementation (or a test fake)?** If yes, abstract; if the concrete class is truly final, skip.

## Common Beginner Pitfalls

1. **DIP without DI** — `new ConcreteClass()` inside the high-level class defeats the principle (see the violation above).
2. **DI without DIP** — injecting a *concrete* class still couples the caller to it; inject the interface.
3. **Abstractions that leak low-level details** — an interface with `getConnection()` or `getSession()` in its signature leaks the implementation's world; the abstraction should speak the business's language.
4. **The "everything must be an interface" reflex** — interfaces for `String` or `Math` are noise; abstract only what varies.
5. **Service Locator / static factories** — `Repo.getInstance()` hides dependencies (like singletons); constructor injection keeps them visible.
6. **Over-abstracting the internal** — an interface that will only ever have one implementation (and no test fake) is speculative; YAGNI applies.

## Key Takeaways

- DIP: high-level and low-level modules both depend on abstractions; details depend on abstractions, not vice versa.
- The inversion = implementations point *up* at the business-defined interface.
- Constructor injection is the mechanism; the composition root (or Spring container) is where concrete choices live.
- Testing becomes trivial with fakes; swapping infrastructure never touches business logic.
- Spring is DIP made operational — beans implement interfaces, the container wires them.
- Don't abstract everything — only what varies or needs faking.
