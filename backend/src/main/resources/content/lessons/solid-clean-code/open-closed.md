---
title: OCP — Open/Closed Principle
module: solid-clean-code
order: 2
minutes: 23
topics: ["OCP", "open for extension", "closed for modification", "polymorphism", "strategy"]
docs:
  - title: "Open/Closed Principle (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle"
---

# OCP — Open/Closed Principle

## The Concept: Add Behavior Without Editing Old Code

The **Open/Closed Principle** (the *O* in SOLID) is a one-liner with huge consequences:

> A class should be **open for extension** but **closed for modification**.

Meaning: you should be able to *add new behavior* without *editing existing, working code*. New features arrive as **new code** (new classes, new branches at a dispatch point) — not as edits inside old methods that already work.

Why does this matter? Every edit to working code risks breaking it. The code that shipped and passed tests is a *known quantity*; the moment you edit it, it's an unknown. OCP maximizes the amount of code you never touch: old behavior stays verified, new behavior arrives additive.

## The Violation — The Ever-Growing Switch

```java
// Every new report type edits this method — OCP violated:
class ReportGenerator {

    String generate(String type, Data data) {
        switch (type) {
            case "pdf":   return renderPdf(data);
            case "csv":   return renderCsv(data);
            case "json":  return renderJson(data);
            // next month: "excel" -> another case, another edit
        }
        throw new IllegalArgumentException("unknown type: " + type);
    }
}
```

Adding Excel support means **editing** `ReportGenerator.generate` — touching the working method, risking the three existing formats, and making the class grow forever. Every addition is a modification.

## The Fix — Polymorphism Does the Switch

```java
// 1. The abstraction: "what every report format can do"
interface ReportFormat {
    String name();                       // "pdf"
    String render(Data data);
}

// 2. Existing formats become small classes — untouched from now on
class PdfReport implements ReportFormat {
    public String name() { return "pdf"; }
    public String render(Data data) { return "PDF:" + data; }
}

class CsvReport implements ReportFormat {
    public String name() { return "csv"; }
    public String render(Data data) { return "a,b,c\n" + data; }
}

class JsonReport implements ReportFormat {
    public String name() { return "json"; }
    public String render(Data data) { return "{\"data\":\"" + data + "\"}"; }
}

// 3. The generator: dispatches to whichever format it was given
class ReportGenerator {
    private final Map<String, ReportFormat> formats;

    ReportGenerator(List<ReportFormat> availableFormats) {
        this.formats = availableFormats.stream()
                .collect(java.util.stream.Collectors.toMap(ReportFormat::name, f -> f));
    }

    String generate(String type, Data data) {
        ReportFormat format = formats.get(type);
        if (format == null) throw new IllegalArgumentException("unknown type: " + type);
        return format.render(data);
    }
}

public class OpenClosedDemo {

    public static void main(String[] args) {
        ReportGenerator generator = new ReportGenerator(
                java.util.List.of(new PdfReport(), new CsvReport(), new JsonReport()));

        System.out.println(generator.generate("pdf", "hello"));   // PDF:hello
        System.out.println(generator.generate("csv", "hello"));   // a,b,c
                                                                  // hello

        // Adding "excel" tomorrow = ONE new class, registered here.
        // The generator, PdfReport, CsvReport, JsonReport never change.
    }
}
```

### Walking Through Each Part

**The interface** — `ReportFormat` is the contract. All formats honor it; the generator depends only on it.

**The concrete formats** — each existing format is now a class. They're *complete and frozen*: from this point, no edit ever touches `PdfReport` again.

**The generator** — dispatch happens through the map: given a type string, look up the format object and delegate. The generator has **no switch** — it never lists the formats; it holds whatever it was given. New formats arrive as new map entries *at construction*, not as edits inside `generate`.

**The demo** — Excel support = write `ExcelReport implements ReportFormat` + add it to the list at construction. The generator's `generate` method, the three existing classes, and their tests are **untouched**. Old behavior provably unchanged; new behavior purely additive.

## The Two Mechanisms

OCP is achieved mainly through:

1. **Polymorphism** (above) — new behavior = new class implementing an interface; dispatch via the interface.
2. **Inheritance** — subclasses override extension points (`template method`). Works, but prefer composition/interfaces over deep hierarchies.

Plus two helpers:

- **Dependency injection** — the generator *receives* its formats instead of `new`-ing them, so the set can grow externally.
- **Strategy pattern** — the formats *are* strategies (see the design-patterns module). OCP is the principle; Strategy is a common implementation.

## OCP in Spring — You Already Use It

- **`@Service`/`@Component` beans implementing an interface** — Spring collects them (`List<ReportFormat>` injection!) and the container wires the map. Adding a bean adds behavior with zero edits to consumers.
- **`@ConditionalOnProperty` / profiles** — different implementations per environment, chosen by config, not by editing code.
- **`@EventListener`** — new listeners add behavior without touching the publisher (Observer/OCP in one).
- **`HandlerMapping` / filters / interceptors** — the framework is open for extension by design.

Spring's tagline "convention over configuration" plus interface-based beans is OCP made operational: you extend by adding beans, not by editing existing ones.

## When OCP Bites Back

The principle has a cost: **indirection**. An interface + N implementations + a registry is more machinery than a switch. Use judgment:

| Add behavior by editing a switch | Add behavior by new class |
|---|---|
| Rules are few and stable | Rules grow often |
| One team owns the whole class | External contributors extend it |
| The switch is 3 branches | 8+ branches and climbing |
| Behavior never changes per-config | Different behavior per environment/config |

Also: OCP shouldn't be applied to *every* future possibility — you can't abstract what doesn't exist yet. The pragmatic reading: **when the third variant appears, that's the moment to introduce the interface.** Two variants can be an `if`; three is a pattern.

## Common Beginner Pitfalls

1. **Abstracting too early** — an interface for one implementation is speculative; wait for the second or third variant.
2. **The switch that comes back** — putting the type-name switch *inside* the new classes' factory still violates OCP if it's an if-chain over concrete classes; use a map/registry.
3. **New behavior via `instanceof` checks** — `if (format instanceof ExcelReport)` recreates the coupling you removed.
4. **Confusing OCP with "never change anything"** — *bug fixes* to a class are fine; OCP targets *adding new behavior*.
5. **Default-interface bloat** — adding abstract methods to the interface breaks all implementations (that's modification); prefer a *new* interface or default methods.

## Key Takeaways

- OCP: open for extension, closed for modification — new behavior as new code, not edits.
- Achieve it with polymorphism + injection: an interface, implementations, and a registry/map.
- Spring makes it operational: adding a `@Bean`/`@Service` adds behavior without editing consumers.
- The Strategy pattern is the canonical OCP implementation.
- Don't abstract prematurely — introduce the interface at the second/third variant, not the first.
