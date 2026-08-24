---
title: Jackson Customization — Serializers, Mixins and API Design
summary: Custom serializers for Money and enums, Jackson mixins for third-party classes, global naming strategies, and the annotations that shape your JSON contract.
order: 22
minutes: 20
topics: [Jackson, ObjectMapper, custom serializer, mixin, naming strategy, @JsonFormat, @JsonProperty]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#howto.spring-mvc.customize-jackson-objectmapper
  - https://github.com/FasterXML/jackson-docs
---

# Jackson Customization — Serializers, Mixins and API Design

## The concept: shape your JSON to match your API contract

Jackson's `ObjectMapper` is the engine behind Spring Boot's JSON serialization. By default it follows Java bean conventions — but your API contract may need different field names, custom formatting for domain types (Money, dates, enums), or control over which fields appear. Spring Boot gives you several customization points without writing boilerplate.

## Custom serializer for a domain type

```java
public class MoneySerializer extends StdSerializer<Money> {
    public MoneySerializer() { super(Money.class); }

    @Override
    public void serialize(Money money, JsonGenerator gen, SerializerProvider provider)
            throws IOException {
        gen.writeStartObject();
        gen.writeNumberField("cents", money.cents());
        gen.writeStringField("currency", money.currency());
        gen.writeStringField("formatted", money.toDisplayString());
        gen.writeEndObject();
    }
}

// Register globally via Jackson configuration
@Configuration
public class JacksonConfig {
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer moneySerializer() {
        return builder -> builder.serializerByType(Money.class, new MoneySerializer());
    }
}
```

**Result:** every `Money` field serializes as `{"cents": 1999, "currency": "USD", "formatted": "$19.99"}`.

## Jackson mixins — customize third-party classes

You can't annotate a class you don't own. Mixins let you add Jackson annotations to any class:

```java
public abstract class InetAddressMixin {
    @JsonProperty("address")
    @JsonGetter("address")
    abstract String getHostAddress();
}

// Register the mixin
@Bean
public Jackson2ObjectMapperBuilderCustomizer inetAddressMixin() {
    return builder -> builder.mixIn(InetAddress.class, InetAddressMixin.class);
}
// Now InetAddress serializes as {"address": "192.168.1.1"} instead of {}
```

## Naming strategies — camelCase, snake_case, kebab-case

```yaml
# application.yml
spring:
  jackson:
    property-naming-strategy: SNAKE_CASE    # or CAMEL_CASE, KEBAB_CASE, UPPER_CAMEL_CASE
    default-property-inclusion: non_null    # omit null fields globally
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: UTC
```

```java
// Or per-controller via annotation
@JsonPropertyNaming(PropertyNamingStrategies.SnakeCase.class)
@RestController
public class UserController { }
```

## Per-field control with annotations

```java
public record OrderDto(
    @JsonProperty("order_id") long id,                    // rename field
    @JsonFormat(pattern = "yyyy-MM-dd") LocalDate date,  // format date
    @JsonInclude(Include.NON_NULL) String notes,          // omit if null
    @JsonValue Money total                                 // serialize as just the value
) {}

// @JsonValue — the entire object serializes as a single value
// @JsonIgnore — skip this field entirely
// @JsonAlias — accept alternative names when deserializing
// @JsonView — include/exclude fields based on the active view
```

## Global ObjectMapper customization

```java
@Configuration
public class JacksonConfig {
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer customJackson() {
        return builder -> builder
            .serializers(new MoneySerializer())
            .mixIn(InetAddress.class, InetAddressMixin.class)
            .featuresToDisable(
                SerializationFeature.WRITE_DATES_AS_TIMESTAMPS,  // use ISO strings
                DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES // ignore unknown fields
            )
            .featuresToEnable(
                SerializationFeature.WRITE_ENUMS_USING_TO_STRING
            )
            .namingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .serializationInclusion(JsonInclude.Include.NON_NULL);
    }
}
```

## org scenarios

**Enum as string in API:**

```java
public enum OrderStatus {
    @JsonProperty("pending") PENDING,
    @JsonProperty("shipped") SHIPPED,
    @JsonProperty("delivered") DELIVERED;

    @JsonValue
    public String toApiValue() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static OrderStatus fromApiValue(String value) {
        return valueOf(value.toUpperCase());
    }
}
// API sees: "pending", "shipped", "delivered" — not "PENDING"
```

**Hiding internal fields from the API:**

```java
public record UserResponse(
    long id,
    String displayName,
    @JsonIgnore String passwordHash,       // never serialize
    @JsonInclude(Include.NON_NULL) String email  // only if set
) {}
```

## Key takeaways

- Use `Jackson2ObjectMapperBuilderCustomizer` to register custom serializers, mixins, and global settings.
- Mixins let you add Jackson annotations to classes you don't own (third-party or JDK classes).
- `@JsonProperty` renames fields; `@JsonFormat` formats dates; `@JsonInclude(NON_NULL)` omits nulls.
- `@JsonValue` and `@JsonCreator` control how enums and custom types serialize/deserialize.
- Set naming strategies and inclusion rules globally in `application.yml` for consistent API contracts.
