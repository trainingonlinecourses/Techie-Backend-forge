---
title: Spring Boot Content Negotiation — JSON, XML and Multiple Formats
summary: Content negotiation strategy, media type configuration, Jackson and JAXB, produce/consume annotations, custom MessageConverters, and API versioning through content type.
order: 38
minutes: 18
topics: [content-negotiation, media-type, jackson, xml, message-converter, api-versioning, accept-header]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/negotiating-view-resolver.html
---

# Spring Boot Content Negotiation — JSON, XML and Multiple Formats

## The concept

**Content negotiation** is the mechanism by which the server and client agree on the format of the response. When a client sends `Accept: application/json`, the server responds with JSON. When it sends `Accept: application/xml`, the server responds with XML.

Spring Boot handles this automatically based on the `Accept` header in the request:

```
GET /api/users/123
Accept: application/json     → {"id":"123","name":"John"}
Accept: application/xml      → <user><id>123</id><name>John</name></user>
Accept: text/plain           → User{id=123, name=John}
```

**Why support multiple formats?**
- Legacy systems may only consume XML
- Internal services may prefer a compact binary format
- Browsers default to JSON, but mobile apps may prefer XML
- API versioning via content type (`application/vnd.myapp.v2+json`)

## Configuration

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
            .defaultContentType(MediaType.APPLICATION_JSON)       // default if no Accept header
            .mediaType("json", MediaType.APPLICATION_JSON)        // mapping aliases
            .mediaType("xml", MediaType.APPLICATION_XML)
            .favorParameter(true)                                 // ?format=xml also works
            .parameterName("format")                              // query param name
            .ignoreAcceptHeader(false);                           // respect the Accept header
    }
}
```

**Resolution order:**
1. URL suffix (e.g., `/users.xml`) — if enabled
2. Query parameter (e.g., `?format=xml`) — if `favorParameter(true)`
3. `Accept` header — standard HTTP content negotiation
4. Default content type — configured fallback

## How we use it in organizations

### Scenario 1: REST API supporting JSON and XML

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping(value = "/{id}", produces = {MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
    public User getUser(@PathVariable String id) {
        return userService.findById(id);  // Jackson serializes to requested format
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON)
    public ResponseEntity<User> createUser(@RequestBody @Valid CreateUserRequest request) {
        User user = userService.create(request);
        return ResponseEntity.status(201).body(user);
    }
}
```

```java
// User POJO — Jackson handles both JSON and XML
@XmlRootElement  // Enable XML serialization
public class User {
    private String id;
    private String name;
    private String email;

    @JsonProperty("user_id")   // JSON field name
    @XmlElement(name = "id")   // XML element name
    public String getId() { return id; }
}
```

### Scenario 2: API versioning via content type

Use content negotiation for API versioning:

```java
@RestController
@RequestMapping("/api/v1/products")
public class ProductControllerV1 {
    @GetMapping(produces = "application/vnd.myapp.v1+json")
    public ProductV1 getProduct(@PathVariable String id) {
        return productService.findByIdV1(id);  // old format
    }
}

@RestController
@RequestMapping("/api/v1/products")
public class ProductControllerV2 {
    @GetMapping(produces = "application/vnd.myapp.v2+json")
    public ProductV2 getProduct(@PathVariable String id) {
        return productService.findByIdV2(id);  // new format with new fields
    }
}
```

```java
@Configuration
public class ApiVersionConfig implements WebMvcConfigurer {
    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer.mediaType("v1", MediaType.parseMediaType("application/vnd.myapp.v1+json"));
        configurer.mediaType("v2", MediaType.parseMediaType("application/vnd.myapp.v2+json"));
    }
}
```

### Scenario 3: Custom MessageConverter for CSV export

```java
@Component
public class CsvMessageConverter<T> extends AbstractGenericHttpMessageConverter<List<T>> {

    private final CsvMapper csvMapper = new CsvMapper();

    public CsvMessageConverter() {
        super(MediaType.parseMediaType("text/csv"));
    }

    @Override
    protected void writeInternal(List<T> objects, Type type,
                                 HttpOutputMessage outputMessage) throws IOException {
        ObjectWriter writer = csvMapper.writerWithSchemaFor(
            (Class<T>) ((ParameterizedType) type).getActualTypeArguments()[0]);
        writer.writeValue(outputMessage.getBody(), objects);
    }
}
```

```java
// Controller endpoint that returns CSV
@GetMapping("/export")
public List<Order> exportOrders(
        @RequestHeader("Accept") String accept,
        @RequestParam(defaultValue = "json") String format) {
    if ("text/csv".equals(accept) || "csv".equals(format)) {
        // Spring uses our CsvMessageConverter
    }
    return orderService.findAll();
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| `@RestController` with no `produces` constraint | Client can request any format |
| XML without `@XmlRootElement` | JAXB throws at runtime |
| Not configuring XML support | Spring returns 406 Not Acceptable for XML |
| Versioning by URL only (`/v1/`, `/v2/`) | Hard to maintain, proliferates controllers |
| Ignoring the Accept header | Client gets wrong format, integration breaks |
| Using `@ResponseBody` with view resolution | Conflict between content negotiation and view |
