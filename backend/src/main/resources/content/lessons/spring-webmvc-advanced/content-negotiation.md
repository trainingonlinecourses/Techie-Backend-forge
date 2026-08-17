---
title: Content Negotiation & Message Conversion
module: spring-webmvc-advanced
order: 2
minutes: 20
topics: ["Accept header", "produces/consumes", "HttpMessageConverter", "Jackson config", "custom converters"]
docs:
  - title: "Content negotiation"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-content-negotiation"
---

# Content Negotiation & Message Conversion

The same endpoint serves many representations. Content negotiation decides *which* representation a client gets, and `HttpMessageConverter`s turn objects into bytes and back. Understanding the negotiation chain is what lets you serve JSON to browsers, XML to partners, and CSV to analysts — from one controller.

## How Negotiation Works

Spring resolves the response format through three strategies, in order:

1. **`Accept` header** — the client says what it wants: `Accept: application/json`.
2. **Path extension** — `GET /api/courses.json` (deprecated, but still seen).
3. **Query parameter** — `GET /api/courses?format=xml` (the `format` param via `ContentNegotiationConfigurer`).

## produces: Declaring What You Serve

```java
@RestController
@RequestMapping("/api/courses")
public class CourseController {

    @GetMapping(value = "/{id}", produces = {
        MediaType.APPLICATION_JSON_VALUE,
        MediaType.APPLICATION_XML_VALUE,
        "text/csv"
    })
    public CourseDto get(@PathVariable Long id) {
        return courseService.findById(id);
    }
}
```

Spring matches the `Accept` header against `produces` and picks the best match. A client sending `Accept: application/json` gets JSON; `Accept: application/xml` gets XML.

## consumes: Declaring What You Read

```java
@PostMapping(value = "/{id}",
    consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.APPLICATION_XML_VALUE})
public CourseDto update(@PathVariable Long id, @RequestBody CourseDto dto) { ... }
```

`consumes` filters on the `Content-Type` of the request — 415 Unsupported Media Type if it doesn't match.

## The HttpMessageConverter Chain

`@RequestBody` and `@ResponseBody` are handled by `HttpMessageConverter`s:

```java
public interface HttpMessageConverter<T> {
    boolean canRead(Class<?> clazz, MediaType mediaType);
    boolean canWrite(Class<?> clazz, MediaType mediaType);
    T read(Class<? extends T> clazz, HttpInputMessage inputMessage);
    void write(T t, MediaType contentType, HttpOutputMessage outputMessage);
}
```

Spring Boot auto-registers the common ones:

| Converter | Handles |
|-----------|---------|
| `MappingJackson2HttpMessageConverter` | JSON (Jackson) |
| `Jaxb2RootElementHttpMessageConverter` | XML (JAXB) |
| `StringHttpMessageConverter` | plain text |
| `ByteArrayHttpMessageConverter` | bytes |
| `FormHttpMessageConverter` | form data |

## Configuring Jackson (JSON) Globally

```yaml
spring:
  jackson:
    default-property-inclusion: non_null     # omit nulls
    serialization:
      write-dates-as-timestamps: false       # ISO-8601 strings
    deserialization:
      fail-on-unknown-properties: false      # lenient on new fields
```

```java
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> builder
            .serializationInclusion(JsonInclude.Include.NON_NULL)
            .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .serializers(new LocalDateTimeSerializer(
                DateTimeFormatter.ISO_LOCAL_DATE_TIME));
    }
}
```

## Custom MessageConverter: CSV

Serving CSV for spreadsheet clients:

```java
@Component
public class CsvHttpMessageConverter extends AbstractHttpMessageConverter<List<?>> {

    public CsvHttpMessageConverter() {
        super(new MediaType("text", "csv"));
    }

    @Override
    protected boolean supports(Class<?> clazz) {
        return List.class.isAssignableFrom(clazz);
    }

    @Override
    protected List<?> readInternal(Class<? extends List<?>> clazz,
                                   HttpInputMessage input) {
        throw new UnsupportedOperationException("CSV read not supported");
    }

    @Override
    protected void writeInternal(List<?> rows, HttpOutputMessage output) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (Object row : rows) {
            if (row instanceof CourseDto c) {
                sb.append(escape(c.id())).append(',')
                  .append(escape(c.title())).append('\n');
            }
        }
        output.getBody().write(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    private String escape(Object v) {
        String s = String.valueOf(v);
        return s.contains(",") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }
}
```

Now `Accept: text/csv` on the list endpoint returns CSV. Zero changes to the controller.

## Content Negotiation Strategies

Configure the resolution order and the format parameter:

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
            .defaultContentType(MediaType.APPLICATION_JSON)
            .mediaType("xml", MediaType.APPLICATION_XML)
            .mediaType("csv", new MediaType("text", "csv"));
        // keep Accept header as the primary strategy
    }
}
```

**Important default**: JSON is the default when nothing is specified. Prefer that over path extensions (`/courses.json`) — extensions create cache-key ambiguity.

## Validation of Negotiation

- **406 Not Acceptable** — client asked for a format you don't serve (with `produces` set, Spring returns 406 automatically).
- **415 Unsupported Media Type** — request body format you can't read.
- **Ambiguity** — two converters claim the same media type; `produces` disambiguates.

## Testing Negotiation

```java
@Test
void returnsJsonByDefault() throws Exception {
    mockMvc.perform(get("/api/courses/1").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.id").value(1));
}

@Test
void returnsXmlWhenRequested() throws Exception {
    mockMvc.perform(get("/api/courses/1").accept(MediaType.APPLICATION_XML))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_XML))
        .andExpect(xpath("//Course/id").string("1"));
}

@Test
void returnsCsvWhenRequested() throws Exception {
    mockMvc.perform(get("/api/courses").accept(new MediaType("text", "csv")))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString(",title")))
        .andExpect(content().string(containsString("1,")));
}
```

## Summary

| Concern | Mechanism |
|---------|-----------|
| Declare output | `produces` on `@GetMapping` |
| Declare input | `consumes` on `@PostMapping` |
| Pick the format | Accept header → extension → format param |
| Object ↔ bytes | `HttpMessageConverter` chain |
| JSON tuning | Jackson properties / customizer |
| New format | Custom `HttpMessageConverter` |
| Errors | 406 (can't serve), 415 (can't read) |

Content negotiation is the part of REST that makes one endpoint serve many clients. Jackson for JSON, JAXB for XML, a 30-line converter for CSV — and your API is suddenly consumable by dashboards, spreadsheets, and browsers alike.
