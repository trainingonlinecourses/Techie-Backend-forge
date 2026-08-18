---
title: HttpMessageConverters — JSON, XML and Custom Serialization
summary: The converter chain for @RequestBody/@ResponseBody, Jackson configuration in Boot, and custom converters for niche formats.
order: 12
minutes: 17
topics: [message-converters, jackson, objectmapper, httpmessageconverter, serialization, content-negotiation]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/message-converters.html
  - https://docs.spring.io/spring-boot/reference/io/json.html
---

# HttpMessageConverters — JSON, XML and Custom Serialization

## The concept: the converter chain turns bytes into objects

`@RequestBody OrderDto body` and `@ResponseBody OrderDto` — how does the byte stream become an object and back? An **`HttpMessageConverter`** bridges the wire and Java types. Spring MVC holds an ordered list; for each request it picks the converter that **can read** the `Content-Type` (and for responses, one the client's `Accept` allows) and **supports** the Java type:

```text
POST /api/orders  (Content-Type: application/json)
   body bytes ──► Jackson's MappingJackson2HttpMessageConverter
              ──► reads JSON ──► OrderDto object
GET /api/orders  (Accept: application/json)
   OrderDto ──► converter writes JSON ──► response body
```

The default Boot converter list includes Jackson (JSON), `StringHttpMessageConverter`, `ByteArrayHttpMessageConverter`, and (with the right starter) XML and Protobuf. The JSON converter is the one you configure 99% of the time.

## Configuring Jackson — the org-standard ObjectMapper

Almost every backend needs a shared Jackson configuration: the `ObjectMapper` is a bean, so customize it once and every converter uses it:

```java
@Configuration
public class JacksonConfig {
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jsonCustomizer() {
        return builder -> builder
            .serializationInclusion(JsonInclude.Include.NON_NULL)      // skip nulls in responses
            .featuresToDisable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)  // tolerate extra fields
            .serializerByType(BigDecimal.class, new ToStringSerializer())  // money as strings!
            .modules(new JavaTimeModule());                             // java.time support (Boot adds it)
    }
}
```

The three settings that matter most:

1. **`NON_NULL` inclusion** — null fields omitted from JSON responses (smaller payloads, stable contracts). Some APIs prefer explicit nulls — decide per API, not per developer.
2. **`FAIL_ON_UNKNOWN_PROPERTIES=false`** — tolerate extra fields in requests, so adding a field to the API doesn't break older clients. (Keep `true` in strict contract tests.)
3. **Money as strings** — `BigDecimal` serialized as a string (`"19.99"`) so JavaScript clients don't lose precision (see the BigDecimal lesson).

Also common: `@JsonFormat`/`@JsonIgnore` per field, and `@JsonCreator`/`@JsonProperty` on records for immutable binding.

## Per-type annotations vs global config

Global config sets the defaults; per-field annotations override:

```java
public record OrderDto(
    @JsonProperty("id") Long orderId,          // rename for the wire
    @JsonIgnore String internalNote,            // never expose internally
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ssXXX") Instant createdAt  // explicit format
) {}
```

The org rule: **global config for system-wide policy** (null handling, money, unknown fields); **annotations for per-contract decisions** (names, ignored fields, formats). Annotations beat config when the same type appears in different shapes on different endpoints.

## How we use it in an organization: the scenarios

**Scenario 1 — API contract stability.** `FAIL_ON_UNKNOWN_PROPERTIES=false` on the server lets clients send extra fields without breaking; the response with `NON_NULL` stays lean. This is the "evolve without breaking" baseline for a public API.

**Scenario 2 — money and dates everywhere.** One config: BigDecimal→string, `Instant`→ISO-8601 (JavaTimeModule). No per-field surprises; frontend teams get a documented format.

**Scenario 3 — versioned field names.** `@JsonProperty("shipping_address")` on a `shippingAddress` record component — the wire contract differs from the Java name, and versioning uses the annotation to keep both.

**Scenario 4 — a custom converter for a niche format.** A vendor sends `application/x-fixed-width`:

```java
@Component
public class FixedWidthConverter extends AbstractHttpMessageConverter<LedgerEntry> {
    public FixedWidthConverter() {
        super(new MediaType("application", "x-fixed-width"), MediaType.TEXT_PLAIN);
    }
    @Override protected boolean supports(Class<?> clazz) { return LedgerEntry.class.isAssignableFrom(clazz); }
    @Override protected LedgerEntry readInternal(...) { /* parse fixed-width rows */ }
    @Override protected void writeInternal(LedgerEntry entry, ...) { /* format */ }
}
// Registered automatically as a bean — appended to the converter chain
```

## The converter chain in practice

- **Content negotiation** decides *which* converter: request `Content-Type` for reading, `Accept` header for writing (see the content-negotiation lesson). A client that sends `text/plain` to a JSON endpoint gets 415; a client that won't accept JSON gets 406.
- **Order matters** — the first converter that supports both the media type and the Java type wins. Custom converters as beans are added to the end by default; use `extendMessageConverters` to control exact ordering.
- **Testing** — `@WebMvcTest` uses the real converter chain; assert the *wire format* (a JSON string match on a serialized response), not just the object — that's what the converter governs.

## Pitfalls

- **Forgetting the JavaTimeModule** — `LocalDate`/`Instant` fail to serialize without it (Boot adds it by default; a hand-rolled ObjectMapper must register it explicitly).
- **Double-serializing** — serializing a `String` that already contains JSON yields escaped garbage; keep DTOs typed.
- **Lazy entities serialized directly** — Jackson walks the object graph and hits lazy JPA associations (N+1 + `LazyInitializationException`); serialize DTOs/projections, never entities (see the projections lesson).
- **`@JsonIgnore` on the wrong side** — ignoring a field on deserialization *and* serialization can drop data in one direction; use `@JsonProperty(access = Access.READ_ONLY)` for one-way.
- **Custom converter that swallows parsing errors** — a read converter that returns null on bad input hides 400s; let the converter throw for the framework's error path.

## Key takeaways

- `HttpMessageConverter`s turn bytes ↔ objects; Jackson is the one you configure.
- Configure once via `Jackson2ObjectMapperBuilderCustomizer`: NON_NULL, tolerant unknown fields, BigDecimal→string, JavaTime.
- Annotations per contract (`@JsonProperty`, `@JsonIgnore`, `@JsonFormat`); global config for policy.
- Custom converters extend the chain for niche formats — register as beans.
- Content type/accept drive converter selection (415/406); test the wire format, not just the object.
