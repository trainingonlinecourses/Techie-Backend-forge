---
title: Jackson Annotations — @JsonProperty, @JsonIgnore, and Friends
module: jackson-json
order: 2
minutes: 25
topics: ["@JsonProperty", "@JsonIgnore", "@JsonFormat", "@JsonInclude", "@JsonCreator", "@JsonAlias", "annotations"]
summary: The previous lesson's ObjectMapper configuration applies globally — one set of rules for everything. Annotations are the pertype instructions: they...
docs:
  - title: "Jackson Annotations (GitHub)"
    url: "https://github.com/FasterXML/jackson-annotations"
  - title: "Jackson Annotations Wiki (FasterXML)"
    url: "https://github.com/FasterXML/jackson-docs/wiki/Jackson-Annotations"
---

# Jackson Annotations — @JsonProperty, @JsonIgnore, and Friends

## The Concept: The Per-Type Instruction Manual

The previous lesson's `ObjectMapper` configuration applies *globally* — one set of rules for everything. **Annotations** are the *per-type* instructions: they tell Jackson how *this specific class* should map, overriding or refining the global defaults. Instead of reshaping the whole mapper for one awkward type, you annotate the type. This is the layer where DTOs become exactly the JSON contract your API promises.

**The mental model:** the ObjectMapper is the company-wide style guide ("dates are ISO, unknown fields ignored"); annotations are the per-document instructions ("for THIS form, call the field `user_id`; never print THIS line"). The annotations are read at mapper initialization and take precedence over the global config for the types they touch.

## The Everyday Set

```java
public class UserDto {

    // @JsonProperty: the Java field's JSON name.
    // The Java name is id; the JSON key is "user_id".
    @JsonProperty("user_id")
    private Long id;

    // @JsonIgnore: never serialize or deserialize this field.
    // (A password hash, a transient cache — anything internal.)
    @JsonIgnore
    private String passwordHash;

    // @JsonAlias: EXTRA accepted input names (output always uses the field name).
    // The API accepts "mail" as well as "email" — forward compatibility.
    @JsonAlias("mail")
    private String email;

    // @JsonFormat: how a temporal type renders.
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate birthDate;

    // @JsonInclude: when to OMIT a field from output.
    // NON_NULL: skip null fields entirely ("active": null disappears).
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String nickname;

    // getters/setters...
}
```

**Walking through the vocabulary:**

- **`@JsonProperty("user_id")`** — rename: the wire format uses `user_id`, the Java code uses `id`. Also usable on *getters/setters* to control one direction independently. It's also the fix for snake_case APIs (or configure `PropertyNamingStrategies` globally — but for *one* field, the annotation is surgical).
- **`@JsonIgnore`** — the most important annotation for security: it removes a field from *both* directions. A serialized password hash is a breach; `@JsonIgnore` is the first line of defense. (Class-level `@JsonIgnoreProperties({"passwordHash"})` does the same for several fields, and is also the fix for bidirectional entity recursion.)
- **`@JsonAlias`** — *input-only* aliases: "mail" and "email" both deserialize into `email`, but output always writes `email`. The tool for accepting legacy payloads while normalizing the contract.
- **`@JsonFormat`** — the per-field date/number format, overriding the global date config. `pattern = "yyyy-MM-dd"` for dates, `shape = Shape.STRING` for enums if you want string enums on one field.
- **`@JsonInclude`** — output filtering: `NON_NULL` (skip nulls — the common choice for lean APIs), `NON_EMPTY` (skip nulls *and* empty strings/collections), `NON_DEFAULT` (skip default-valued fields). The global version is the `spring.jackson.default-property-inclusion` property; per-field beats global.

## Constructors and Factories: @JsonCreator

When a class has no no-arg constructor and isn't a record, Jackson needs help building it. `@JsonCreator` marks the constructor (or static factory) that maps JSON keys to parameters:

```java
public class ImmutablePoint {
    private final int x;
    private final int y;

    // Jackson can't call setX on a final field — mark the constructor.
    @JsonCreator
    public ImmutablePoint(@JsonProperty("x") int x, @JsonProperty("y") int y) {
        this.x = x;
        this.y = y;
    }
    public int getX() { return x; }
    public int getY() { return y; }
}
```

**The pattern:** immutable classes (final fields, no setters) need `@JsonCreator` on the constructor, with `@JsonProperty` naming each parameter (Jackson matches constructor params to JSON keys by name — without the annotation, the param *names* are used, which needs the `-parameters` compiler flag; the annotations make it explicit and robust). The same annotation works on a `static` factory method (`@JsonCreator public static Point of(@JsonProperty("x") int x, ...)`).

## Deserialization-Only and Serialization-Only Control

```java
// READ-only field (output only, never accepted from input):
@JsonProperty(access = JsonProperty.Access.READ_ONLY)
private String computedTotal;      // e.g., server-computed — input ignored

// WRITE-only field (input only, never emitted):
@JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
private String password;           // accept on signup, never echo back
```

`Access.READ_ONLY`/`WRITE_ONLY` are the surgical version of the direction control: a server-computed field shouldn't be accepted from clients (READ_ONLY — their value is ignored), and a password shouldn't be emitted (WRITE_ONLY). The `password` case is the classic: accepted on input, never serialized back.

## The Recursion Fix: Serializing Entities

Entities with bidirectional relationships serialize infinitely (`order` → `customer` → `orders` → ...). The annotation fixes:

```java
// On the "forward" side:
public class Order {
    @JsonManagedReference       // this side IS serialized
    private Customer customer;
}

public class Customer {
    @JsonBackReference          // this side is SKIPPED during serialization
    private List<Order> orders;
}
```

`@JsonManagedReference`/`@JsonBackReference` pair breaks the cycle: the forward reference serializes, the back reference is omitted. (For deserialization they need care — `@JsonIdentityInfo` is the alternative for object graphs with identity. The *clean* production answer, though, is **DTOs**: never serialize entities directly, map to DTOs with explicit fields — which also fixes lazy-loading and leaks.)

## The Enum Question

```java
// Default: enums serialize as their NAME: "PENDING".
// @JsonFormat on the FIELD: string enum per-field:
@JsonFormat(shape = JsonFormat.Shape.STRING)
private OrderStatus status;

// Or @JsonValue on the enum itself — a custom representation:
public enum OrderStatus {
    PENDING("pending"), SHIPPED("shipped");
    private final String code;
    OrderStatus(String c) { code = c; }
    @JsonValue                      // serializes as "pending" (the code)
    public String getCode() { return code; }
    // + @JsonCreator for the reverse direction, or @JsonEnumDefaultValue
}
```

**The three options:** default name, per-field string shape, or custom representation via `@JsonValue` (plus `@JsonCreator` for input). For versioned APIs, `@JsonEnumDefaultValue` marks the fallback for unknown enum values — the "forward-compatible enum" pattern.

## Recap

Jackson annotations are the per-type instruction manual: `@JsonProperty` (renaming — the snake_case and wire-contract tool), `@JsonIgnore`/`@JsonIgnoreProperties` (the security-critical "never serialize this" and the recursion fix), `@JsonAlias` (input-only aliases for forward compatibility), `@JsonFormat` (per-field date/enum formats), `@JsonInclude` (lean output by omitting nulls), `@JsonCreator` (building immutable classes), `Access.READ_ONLY`/`WRITE_ONLY` (direction control — passwords in, never out), and `@JsonValue`/`@JsonCreator` for enums. The discipline: prefer DTOs over raw entities, use `@JsonIgnore` for anything sensitive, and keep the annotations as the explicit contract between your Java types and the JSON your API promises.
