---
title: Custom Serializers and Deserializers — Full Control
module: jackson-json
order: 3
minutes: 26
topics: ["JsonSerializer", "JsonDeserializer", "custom serialization", "JsonNode", "polymorphism", "views"]
docs:
  - title: "JsonSerializer (Jackson API)"
    url: "https://fasterxml.github.io/jackson-databind/javadoc/2.14/com/fasterxml/jackson/databind/JsonSerializer.html"
  - title: "JsonDeserializer (Jackson API)"
    url: "https://fasterxml.github.io/jackson-databind/javadoc/2.14/com/fasterxml/jackson/databind/JsonDeserializer.html"
---

# Custom Serializers and Deserializers — Full Control

## The Concept: When Annotations Aren't Enough

Annotations cover 95% of JSON mapping. The rest needs **code**: a value whose wire format is genuinely custom (a money amount as a string, a date in a legacy format, a cryptographic key), a type that needs processing on the way in or out, or polymorphic handling that annotations can't express cleanly. Jackson opens its pipeline for this: **`JsonSerializer<T>`** (custom write logic) and **`JsonDeserializer<T>`** (custom read logic), registered per-type or per-field.

**The mental model:** the annotations are *rules*; custom serializers are *programs*. When the rules can't produce the wire format you need, you write the program: a serializer class whose `serialize()` method writes exactly what you want, and a deserializer whose `deserialize()` method reads it back. Jackson calls your code at the right point in the pipeline — you're plugged into the machinery, not replacing it.

## A Custom Serializer, Step by Step

Say the API must emit monetary amounts as *decimal strings* (`"99.50"` — not floating-point JSON), because floating-point JSON can lose precision:

```java
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.math.BigDecimal;

// The serializer: HOW a BigDecimal becomes JSON text.
public class MoneySerializer extends JsonSerializer<BigDecimal> {

    @Override
    public void serialize(BigDecimal value, JsonGenerator gen,
                          SerializerProvider serializers) throws IOException {
        if (value == null) {
            gen.writeNull();
            return;
        }
        // Always two decimal places, as a STRING — "99.50", not 99.5:
        gen.writeString(value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
    }
}
```

**Walking through it:** `serialize(value, gen, provider)` receives the value and a `JsonGenerator` — the streaming writer. The generator's `writeString`/`writeNumber`/`writeNull`/`writeObject` methods emit the JSON tokens. Here we format the `BigDecimal` to two places and emit it as a *string* — the wire format is `"99.50"`, preserving precision and matching the API contract.

## Registering and Using It

```java
// Register per-field with @JsonSerialize:
public class OrderDto {
    @JsonSerialize(using = MoneySerializer.class)
    private BigDecimal total;

    @JsonSerialize(using = MoneySerializer.class)
    private BigDecimal tax;
}

// OR register globally by type (every BigDecimal uses it):
@Bean
Jackson2ObjectMapperBuilderCustomizer moneyCustomizer() {
    return builder -> builder.serializers(new MoneySerializer())
                             .deserializers(new MoneyDeserializer());
}
```

The choice: **per-field** (`@JsonSerialize(using=...)`) for one-off custom types; **global registration** for a type that always maps the same way (money always a string). Spring Boot's `Jackson2ObjectMapperBuilderCustomizer` is the clean hook — it adds your serializers without clobbering Boot's auto-configuration.

## The Matching Deserializer

```java
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

public class MoneyDeserializer extends JsonDeserializer<BigDecimal> {

    @Override
    public BigDecimal deserialize(JsonParser p, DeserializationContext ctxt)
            throws IOException {
        // The JSON value arrives as text ("99.50") — parse it back.
        String text = p.getText();
        if (text == null || text.isBlank()) return null;
        return new BigDecimal(text);
    }
}
```

`deserialize(parser, ctxt)` receives the JSON parser positioned at the value; `getText()` reads it as a string; we convert back to `BigDecimal`. Register it the same way (`@JsonDeserialize(using=...)` or globally). The pair is symmetric: the serializer defines the wire format, the deserializer accepts it — they must agree, or round-tripping breaks.

## JsonNode: The Flexible Middle Ground

For *dynamic* or *partial* JSON — responses you can't model as fixed classes (an event stream, an API gateway pass-through) — **`JsonNode`** is the tree model: JSON as a traversable structure:

```java
ObjectMapper mapper = new ObjectMapper();

// Parse into a tree:
JsonNode root = mapper.readTree("{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"meta\":{\"v\":1}}");

// Traverse:
String name = root.get("name").asText();           // Ada
String firstTag = root.get("tags").get(0).asText(); // a
int version = root.path("meta").path("v").asInt();  // 1 (path = missing-safe)

// Modify and re-serialize:
((ObjectNode) root).put("extra", 42);
String out = mapper.writeValueAsString(root);

// Build from scratch:
ObjectNode node = mapper.createObjectNode();
node.put("id", 1L);
node.putArray("tags").add("spring");
node.set("meta", mapper.createObjectNode().put("v", 1));
```

**When to use the tree model:** pass-through proxies, config that's genuinely shape-shifting, and "peek at one field before full deserialization." It's slower and less type-safe than POJO mapping — use it deliberately, not as the default.

## Polymorphism: Handling Subtypes

When a field can hold *different* concrete types, Jackson needs to know which class to build. The annotation approach (`@JsonTypeInfo`) embeds a type discriminator:

```java
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = CreditCardPayment.class, name = "card"),
    @JsonSubTypes.Type(value = BankPayment.class, name = "bank")
})
public abstract class Payment {
    public BigDecimal amount;
}

public class CreditCardPayment extends Payment { public String last4; }
public class BankPayment extends Payment { public String iban; }

// Serializing a CreditCardPayment:
// {"type":"card","amount":99.5,"last4":"4242"}
// Deserializing reads "type" -> builds CreditCardPayment.
```

**The danger zone:** `@JsonTypeInfo` with `Id.CLASS` or default-typing lets JSON name *arbitrary classes* — the deserialization attack from the secure-coding lesson. **Use `Id.NAME` with an explicit `@JsonSubTypes` allowlist** (never `Id.CLASS` on untrusted input) — the allowlist is what keeps polymorphic deserialization safe.

## Views: One Object, Many Shapes

**`@JsonView`** serializes the *same* object differently per context — public fields vs admin fields:

```java
public class Views {
    public static class Public { }
    public static class Internal extends Public { }   // Internal = Public + more
}

public class UserDto {
    @JsonView(Views.Public.class)
    public String name;
    @JsonView(Views.Public.class)
    public String email;
    @JsonView(Views.Internal.class)
    public String phone;       // only in the Internal view
}

// Controller: the Internal view exposes everything:
@JsonView(Views.Internal.class)
@GetMapping("/users/{id}")
public UserDto get(@PathVariable Long id) { ... }

// A public endpoint uses the Public view — phone is omitted.
```

**The trade-off vs DTOs:** views avoid duplicating classes for "same shape, different fields" — but they spread the contract across annotations. For more than two views, explicit DTOs are usually clearer. Views are the right tool when the object is genuinely one type with context-dependent exposure (public profile vs admin record).

## Recap

Custom serializers and deserializers open Jackson's pipeline to code: a `JsonSerializer<T>` writes the exact wire format (`gen.writeString(...)`), a `JsonDeserializer<T>` reads it back, registered per-field (`@JsonSerialize(using=...)`) or globally via `Jackson2ObjectMapperBuilderCustomizer`. `JsonNode` is the tree model for dynamic/partial JSON; `@JsonTypeInfo` + `@JsonSubTypes` (with an *allowlist* — never `Id.CLASS` on untrusted input) handles polymorphism; and `@JsonView` shapes one object per context. The craft is choosing the right layer — annotations for the 95%, custom code for the wire formats annotations can't express, and DTOs or views for context-dependent shapes — so the JSON contract stays explicit, precise, and safe.
