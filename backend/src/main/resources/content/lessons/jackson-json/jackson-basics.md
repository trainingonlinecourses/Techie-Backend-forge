---
title: Jackson Basics — ObjectMapper, Serialization, and Deserialization
module: jackson-json
order: 1
minutes: 24
topics: ["Jackson", "ObjectMapper", "serialization", "deserialization", "JSON", "Spring Boot"]
docs:
  - title: "Jackson Databind (GitHub)"
    url: "https://github.com/FasterXML/jackson-databind"
  - title: "Jackson Documentation (FasterXML)"
    url: "https://github.com/FasterXML/jackson-docs"
summary: Every Spring Boot REST API lives on a JSON bridge: the request body arrives as JSON text, becomes a Java object, flows through your service, and re...
---

# Jackson Basics — ObjectMapper, Serialization, and Deserialization

## The Concept: The Bridge Between Java Objects and JSON

Every Spring Boot REST API lives on a JSON bridge: the request body arrives as JSON text, becomes a Java object, flows through your service, and returns as JSON. **Jackson** is that bridge — the de-facto standard JSON library for Java (Spring Boot uses it by default). At its heart is a single class: **`ObjectMapper`**, which converts Java objects to JSON (**serialization**) and JSON back to Java objects (**deserialization**).

**The mental model:** `ObjectMapper` is a two-way translator. Its `writeValueAsString(obj)` speaks Java → JSON; its `readValue(json, Class)` speaks JSON → Java. The translation rules — which fields become which keys, how dates and nulls are handled, how unknown fields are treated — are the *configuration*, and they're where the craft lives. Spring Boot auto-configures an `ObjectMapper` bean (with sensible defaults for web apps); you customize it when the defaults don't fit.

## The Core Two Operations

```java
import com.fasterxml.jackson.databind.ObjectMapper;

public class JacksonBasics {
    // A plain Java object — the thing we translate.
    static record Lesson(Long id, String title, int minutes, boolean published) {}

    public static void main(String[] args) throws Exception {
        ObjectMapper mapper = new ObjectMapper();   // the translator

        // ---- SERIALIZATION: Java -> JSON ----
        Lesson lesson = new Lesson(1L, "Generics Basics", 24, true);
        String json = mapper.writeValueAsString(lesson);
        System.out.println(json);
        // {"id":1,"title":"Generics Basics","minutes":24,"published":true}

        // ---- DESERIALIZATION: JSON -> Java ----
        String incoming = "{\"id\":2,\"title\":\"Wildcards\",\"minutes\":27,\"published\":false}";
        Lesson parsed = mapper.readValue(incoming, Lesson.class);
        System.out.println(parsed.title() + " / " + parsed.minutes());
        // Wildcards / 27

        // ---- Collections work naturally: ----
        String listJson = mapper.writeValueAsString(java.util.List.of(lesson, parsed));
        java.util.List<Lesson> lessons = mapper.readValue(
                listJson,
                new com.fasterxml.jackson.core.type.TypeReference<java.util.List<Lesson>>() {});
        System.out.println(lessons.size());   // 2
    }
}
```

**Walking through it:**

- `writeValueAsString(obj)` — walks the object's *getters* (and public fields), emits the JSON. For a record, the accessor methods (`id()`, `title()`...) drive the output. The keys match the property names: `id`, `title`, `minutes`, `published`.
- `readValue(json, Lesson.class)` — parses the JSON and *constructs* a `Lesson`. For a record, Jackson uses the canonical constructor; for a normal class, the no-arg constructor + setters (or fields). **The deserialization requirement to remember:** the target must have a usable constructor/access — no-arg constructor + setters, or a canonical record constructor, or a `@JsonCreator`.
- **Collections need `TypeReference`** — `Lesson.class` tells Jackson the *element type* is Lesson, but `List<Lesson>` erases the generic type; `new TypeReference<List<Lesson>>() {}` captures it at compile time (the generic-superclass trick from the reflection lesson).

## How Jackson Sees Your Objects

**Serialization** uses *getters* (`getId()` → key `id`), **deserialization** uses *setters* (key `id` → `setId(...)`) or the constructor. The implications:

- A field without a getter isn't serialized; a JSON key without a setter fails (by default — see `FAIL_ON_UNKNOWN_PROPERTIES` below).
- `boolean` getters may be `isXxx()`; Jackson handles both.
- Records work out of the box (accessor methods + canonical constructor) — the modern choice for DTOs.

## The Configuration Dials

```java
ObjectMapper mapper = new ObjectMapper();

// The dials that matter for REST APIs:
mapper.configure(
        com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
        false);
// Default: TRUE — an unexpected JSON key fails deserialization.
// REST APIs usually turn it OFF so adding a field to the payload
// (a forward-compatible client) doesn't break the server.

mapper.configure(
        com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS,
        false);
// Default: dates serialize as numeric timestamps; false gives ISO-8601
// strings — what REST APIs actually want.

// Pretty printing for debugging:
mapper.enable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);
```

**The most common production dials:** `FAIL_ON_UNKNOWN_PROPERTIES=false` (forward compatibility), `WRITE_DATES_AS_TIMESTAMPS=false` (ISO dates), and the JavaTimeModule for `java.time` types (auto-registered in Spring Boot). In Spring Boot, configure them via `application.properties` (`spring.jackson.*`) or by providing your own `Jackson2ObjectMapperBuilderCustomizer` bean — without breaking Boot's auto-configured mapper.

## The Spring Boot Integration

```java
// Spring Boot auto-configures the ObjectMapper bean:
@RestController
class LessonController {
    // Request body JSON -> Lesson (Jackson)
    @PostMapping("/lessons")
    Lesson create(@RequestBody Lesson lesson) { ... }

    // Lesson -> response JSON (Jackson)
    @GetMapping("/lessons/{id}")
    Lesson get(@PathVariable Long id) { ... }
}
```

**The invisible magic:** `@RequestBody` tells Spring "deserialize the body into this type" (it uses the configured `ObjectMapper`); the return value of a `@RestController` method is serialized by the same mapper. `@JsonIgnoreProperties`, `@JsonProperty`, `@JsonFormat` annotations on your DTOs customize per-type. The ecosystem: `ResponseEntity<T>` for status codes, `Page<T>` for pagination, records for DTOs — all flowing through the same translator.

## The Common First-Project Surprises

1. **"No default constructor found"** — your class lacks a no-arg constructor and isn't a record. Add one (or use `@JsonCreator` on the constructor you have).
2. **"Unrecognized field"** — a JSON key with no matching property. Either add the field or disable `FAIL_ON_UNKNOWN_PROPERTIES`.
3. **Dates as weird numbers** — `WRITE_DATES_AS_TIMESTAMPS` defaults on; disable it (or register the JavaTimeModule) for ISO strings.
4. **Infinite recursion** — bidirectional relationships (`A` ↔ `B` with references both ways) recurse forever during serialization. Fix: `@JsonIgnore` one side, `@JsonManagedReference`/`@JsonBackReference`, or DTOs (the clean answer — never serialize entities directly).
5. **Case sensitivity and naming** — Jackson defaults to exact property names; use `@JsonProperty("user_id")` or `PropertyNamingStrategies.SNAKE_CASE` for snake_case APIs.

## Recap

Jackson is the Java↔JSON bridge: `ObjectMapper.writeValueAsString` serializes (getters/accessors → keys), `readValue` deserializes (constructor/setters ← keys), and collections need `TypeReference` for their element types. The configuration dials — `FAIL_ON_UNKNOWN_PROPERTIES`, date formats, the JavaTimeModule — are what make the bridge behave like a REST API expects. Spring Boot wires an auto-configured mapper into `@RequestBody`/`@ResponseBody`, so your DTOs and records flow across the wire with zero ceremony. Master the core two operations and the dials, and the JSON layer of your API becomes invisible — until you need `@JsonProperty`, custom serializers, or the polymorphic features of the next lessons.
