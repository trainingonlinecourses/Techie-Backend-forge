---
title: ISP — Interface Segregation Principle
module: solid-clean-code
order: 4
minutes: 21
topics: ["ISP", "fat interfaces", "role interfaces", "segregation", "adapter"]
summary: The Interface Segregation Principle (the I in SOLID):
docs:
  - title: "Interface segregation principle (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Interface_segregation_principle"
---

# ISP — Interface Segregation Principle

## The Concept: Don't Force Clients to Depend on What They Don't Use

The **Interface Segregation Principle** (the *I* in SOLID):

> No client should be forced to depend on methods it does not use.

Imagine a universal remote that also has a built-in vacuum cleaner and a coffee maker. You buy it for the TV, but the remote's interface drags along vacuum and coffee controls — buttons you never press, features that can break, a manual you must read. A better design: separate remotes — a TV remote, a vacuum remote, a coffee remote — each with exactly the controls its users need.

In Java, this is about **fat interfaces**: an interface with many methods where each *implementer* ends up writing `throw new UnsupportedOperationException()` or empty bodies for the methods it doesn't care about, and each *client* depends on methods it never calls. The fix: **segregate** — split the fat interface into small, role-specific interfaces.

## The Fat Interface

```java
// A fat interface — every implementer must implement EVERYTHING:
interface Machine {
    void print(String doc);      // printers need this
    void scan(String doc);       // scanners need this
    void fax(String doc);        // fax machines need this
    void staple(String doc);     // staplers need this
}

// A printer is forced to fake scan/fax/staple:
class SimplePrinter implements Machine {
    public void print(String doc) { System.out.println("printing " + doc); }
    public void scan(String doc)  { throw new UnsupportedOperationException("no scanner"); }
    public void fax(String doc)   { throw new UnsupportedOperationException("no fax"); }
    public void staple(String doc){ throw new UnsupportedOperationException("no stapler"); }
}
```

Problems:

- The printer **depends on** four methods it can't do — a dependency on things it doesn't use.
- The `throw` methods are landmines: any client that calls `machine.scan(printer)` crashes at runtime.
- Adding a method to `Machine` (say `collate`) breaks **every** implementer and **every** client.
- Testing `SimplePrinter` requires implementing four irrelevant methods.

## The Segregated Version

```java
// Small, role-specific interfaces — each implementer implements only what it does:
interface Printer { void print(String doc); }
interface Scanner { void scan(String doc); }
interface Faxer    { void fax(String doc); }
interface Stapler  { void staple(String doc); }

// A printer now implements ONLY printing — no faking, no throws:
class SimplePrinter implements Printer {
    public void print(String doc) { System.out.println("printing " + doc); }
}

// A multifunction device implements the roles it actually has:
class AllInOne implements Printer, Scanner, Faxer {
    public void print(String doc) { System.out.println("printing " + doc); }
    public void scan(String doc)  { System.out.println("scanning " + doc); }
    public void fax(String doc)   { System.out.println("faxing " + doc); }
}

// Clients depend only on the role they need:
class Office {
    // The "print a document" client knows only about Printer:
    void printJob(Printer p, String doc) { p.print(doc); }   // works for ANY printer
}
```

### What Changed and Why

- **Each implementer implements only its roles** — no `UnsupportedOperationException` anywhere. A printer is honestly just a `Printer`.
- **Clients depend on the narrow role** — the `printJob` client takes a `Printer`; it can't accidentally call `scan` (it doesn't even see it). Dependencies shrink to what's used.
- **Adding a capability** (say `Collater`) adds a new interface + implementers that have it — existing interfaces and clients untouched.
- **Testing** — `SimplePrinter` is one method. Done.

## ISP and Interface Evolution

Fat interfaces create a specific maintenance horror: **adding a method breaks all implementers**. With segregated interfaces:

- Adding a new *role* = new interface; existing code untouched.
- Adding a method to an existing role interface still breaks that role's implementers — but only them, and only if they're a genuine mismatch.

The general rule: **interfaces should be as small as the smallest coherent role a client needs.** A role interface has one "voice" — `Printer` says "I print"; `Repository` says "I store and retrieve"; `Notifier` says "I notify".

## Role Interfaces in Real Code

- **`Runnable` vs `Callable`** — one interface for "run, no result", one for "call, with result". Clients pick the role they need.
- **`List` vs `Collection` vs `Iterable`** — the JDK itself segregates: a method that only iterates takes `Iterable`, not `List`.
- **Spring's `*Repository` interfaces** — `CrudRepository`, `PagingAndSortingRepository`, `JpaRepository` are segregated roles; a service needing only `findById` depends on `CrudRepository`, not the fat `JpaRepository`.
- **`ApplicationEventPublisher` vs `MessageSource`** — separate roles injected separately.

## The Test: Would a Client Break?

For each method in your interface, ask: *is there a legitimate client that needs this method, and would every implementer genuinely support it?* If some implementer would have to throw or stub — that method belongs in a different (or no) interface.

If you *must* work with an existing fat interface, the **Adapter pattern** rescues you: implement the narrow interface you need by wrapping the fat one:

```java
class PrinterAdapter implements Printer {
    private final Machine machine;
    PrinterAdapter(Machine m) { this.machine = m; }
    public void print(String doc) { machine.print(doc); }   // only the needed method
}
```

## Common Beginner Pitfalls

1. **One interface per class** — that's the reverse error: splitting so finely that you have a role per method. Segregate by *client need*, not by method count.
2. **The `throws UnsupportedOperationException` smell** — if an implementer throws on an interface method, the interface is too fat (or the implementer shouldn't implement it).
3. **Implementing interfaces "just in case"** — adding `implements Serializable, Cloneable` with no need drags in contracts you don't honor.
4. **Fat interfaces inherited from frameworks** — wrap them with an adapter rather than implementing the whole thing.
5. **Breaking clients by growing an interface** — adding methods to a widely-implemented interface is a breaking change; create a new interface and let implementers opt in.

## Key Takeaways

- ISP: clients should depend only on the methods they use — no fat interfaces.
- Segregate by *role*: `Printer`, `Scanner`, `Faxer` instead of `Machine`.
- Fat interfaces force `UnsupportedOperationException` stubs and break every implementer when they grow.
- Small role interfaces make dependencies honest, testing trivial, and evolution safe.
- The Adapter pattern bridges from fat framework interfaces to the narrow role you need.
