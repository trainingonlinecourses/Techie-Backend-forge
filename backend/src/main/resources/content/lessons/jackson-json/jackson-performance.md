---
title: Jackson Performance — Streaming, Caching, and Serialization Features
module: jackson-json
order: 4
minutes: 24
topics: ["performance", "streaming", "JsonGenerator", "ObjectMapper reuse", "serialization features", "bulk"]
docs:
  - title: "Jackson Performance (FasterXML wiki)"
    url: "https://github.com/FasterXML/jackson-docs/wiki/Performance"
  - title: "JsonGenerator (Jackson API)"
    url: "https://fasterxml.github.io/jackson-databind/javadoc/2.14/com/fasterxml/jackson/core/JsonGenerator.html"
summary: For most APIs, Jackson's speed is a nonissue — the database and the network dominate. But at high throughput (a gateway, a log pipeline, a busy sea...
---

# Jackson Performance — Streaming, Caching, and Serialization Features

## The Concept: JSON Speed Is a Configuration, Not Luck

For most APIs, Jackson's speed is a non-issue — the database and the network dominate. But at high throughput (a gateway, a log pipeline, a busy search indexer), JSON becomes the bottleneck, and the difference between a tuned and an untuned mapper is **10× or more**. This lesson is the performance playbook: the *habits* (reuse the mapper, cache the ObjectMapper) and the *levers* (streaming for bulk, serialization features for leaner output) that make Jackson fast without micro-optimization.

**The mental model:** each `new ObjectMapper()` is expensive (it builds an internal registry of serializers for every type it sees). Jackson is designed to be **created once and reused forever** — thread-safe after configuration. The fastest Jackson is the one that never re-learns your types. From there, the speed story is about *how much work per byte*: streaming writes with no intermediate buffers, features that skip unnecessary output, and avoiding the reflection-heavy paths where cheap alternatives exist.

## Habit 1: One Mapper, Reused Forever

```java
// WRONG — a new mapper per request (or per method call):
String json = new ObjectMapper().writeValueAsString(order);
// Every call: rebuild the serializer registry, re-scan the class. SLOW.

// RIGHT — a single, configured, shared instance (thread-safe):
public final class Json {
    private static final ObjectMapper MAPPER = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private Json() {}
    public static String toJson(Object o) { return MAPPER.writeValueAsString(o); }
}

// In Spring Boot, this is already done for you — the auto-configured
// ObjectMapper BEAN is a singleton. Inject it; never create your own.
```

**The rule:** one `ObjectMapper` per application (Spring Boot's bean), configured once. It's thread-safe by design — sharing it is *correct*, not a hack. Creating mappers per-call is the single most common Jackson performance mistake.

## Habit 2: The Serialization Features

The features that change output size and speed:

```java
ObjectMapper mapper = new ObjectMapper();

// Smaller, faster output:
mapper.disable(SerializationFeature.INDENT_OUTPUT);
// Pretty-printing is for humans and debugging — it multiplies output size.
// Production REST output: compact.

mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
// Skip null fields: less output, fewer bytes on the wire.
// (Every null field you DON'T emit is a few bytes you don't serialize.)

mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
// ISO strings vs numeric timestamps — ISO is the API standard anyway.

// The precision trade-off — usually leave ON:
// mapper.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
// Sorting keys makes output deterministic (cache-friendly) at a small cost.
```

**The rule of thumb:** compact output (no indentation) + `NON_NULL` inclusion is the production baseline — smaller payloads, faster serialization, less bandwidth. Deterministic ordering (`ORDER_MAP_ENTRIES_BY_KEYS`) matters for caches and diffing; enable it deliberately.

## Habit 3: Streaming for Bulk — JsonGenerator and the Read Tree

For *huge* outputs (a million-row export), building the whole `String` in memory is wasteful. **Streaming** writes tokens directly to an output:

```java
// Streaming write — one record at a time, no giant String in memory:
try (OutputStream os = response.getOutputStream();
     JsonGenerator gen = mapper.getFactory().createGenerator(os)) {
    gen.writeStartArray();
    for (Row row : rows) {
        gen.writeStartObject();
        gen.writeNumberField("id", row.id());
        gen.writeStringField("name", row.name());
        gen.writeEndObject();
    }
    gen.writeEndArray();
}
```

`JsonGenerator` emits tokens (`writeStartObject`, `writeStringField`, ...) straight to the stream — the memory cost is O(1) per record instead of O(total output). This is how Jackson itself works under the hood; using the generator directly is the escape hatch for the bulk cases where `writeValueAsString` builds too much.

The read side mirrors it: `mapper.getFactory().createParser(input)` + `JsonParser.nextToken()` gives token-stream parsing — for consuming enormous JSON without a full tree. (And for *processing* huge streams, Jackson's `ObjectReader.readValues(...)` gives per-object iteration.)

## The Bulk Pattern: Reuse the Readers

For repeated deserialization of *the same type* (the common case in a pipeline), cache the **`ObjectReader`** — it pre-computes per-type machinery:

```java
// One reader per type, reused:
private final ObjectReader lessonReader =
        mapper.readerFor(Lesson.class);

// Per message: reader.readValue(json) — skips re-deriving the type setup.
Lesson l = lessonReader.readValue(messageJson);
```

`ObjectReader`/`ObjectWriter` are the thread-safe, type-specialized, *cached* views of the mapper — the documented pattern for hot loops deserializing one type repeatedly.

## The Performance Numbers to Know

- **`new ObjectMapper()`** per call: the re-registration cost dominates for small payloads — easily 2–5× slower than a reused mapper.
- **Pretty printing**: output size roughly doubles; serialization cost rises proportionally. Production: off.
- **Including nulls**: every null field costs bytes on the wire and time in the serializer. `NON_NULL`: the standard.
- **Streaming vs string-building** for bulk: memory goes from O(output) to O(record); the win is memory, not raw speed.
- **Records vs POJOs**: records serialize slightly faster (final fields, direct accessors) and are the modern recommendation for DTOs.

## The Full Optimization Checklist

1. **One configured `ObjectMapper` bean**, injected everywhere — never per-call.
2. **Compact output** (no indentation), `NON_NULL` inclusion — the production baseline.
3. **ISO dates** (`WRITE_DATES_AS_TIMESTAMPS` off) — standard and clear.
4. **Streaming** (`JsonGenerator`) for bulk exports/imports; per-object `ObjectReader` reuse in hot loops.
5. **Measure before optimizing** — profile with a realistic payload; if JSON is <5% of the request time, stop here and fix the database instead.
6. **Know the escape hatches** — if a single DTO is the hot spot, `@JsonSerialize` a leaner form or a `Map`; if the whole pipeline is hot, consider protobuf — but only after Jackson's easy wins are taken.

## Recap

Jackson performance is mostly *habits*: one reused `ObjectMapper` (Spring's bean — thread-safe, never recreate), compact output with `NON_NULL` inclusion, and ISO dates. For bulk work, **stream** with `JsonGenerator` (O(1) memory per record) and cache **`ObjectReader`**s per type for hot deserialization loops. The wins are large (often 2–10×) and nearly free — they come from configuration and reuse, not exotic tricks. And the discipline matters too: measure first, fix the database when JSON isn't the bottleneck, and reserve protobuf-style alternatives for the pipelines where Jackson's easy wins are already exhausted.
