---
title: JSON Schema, Validation, and Integration Patterns
module: jackson-json
order: 5
minutes: 24
topics: ["JSON Schema", "validation", "Bean Validation", "JsonNode validation", "integration", "error handling"]
docs:
  - title: "JSON Schema (json-schema.org)"
    url: "https://json-schema.org/"
  - title: "Networknt JSON Schema Validator"
    url: "https://github.com/networknt/json-schema-validator"
---

# JSON Schema, Validation, and Integration Patterns

## The Concept: The Contract Beyond the Code

Serialization handles *shape*; **validation** handles *correctness*. The JSON your API accepts isn't just well-formed — it must satisfy business rules: a total can't be negative, an email must look like an email, required fields must be present. This lesson is the contract layer: **JSON Schema** (the machine-readable specification of what valid JSON looks like — the API's documentation *and* its guard) and **Bean Validation** (the Spring-side validation that enforces those rules before your service code runs).

**The mental model:** the DTO defines the *types*; validation defines the *rules*. Jackson turns bytes into objects; validation then decides whether those objects are *acceptable*. JSON Schema is the language for expressing the rules independent of Java; Bean Validation (`@NotBlank`, `@Min`, `@Email`) is the Java-native way — and for a Spring API, the two can be complementary: Bean Validation for the 90% (declarative, integrated with `@RequestBody`), JSON Schema for the contract-first 10% (published specs, schema-driven generation, cross-language agreements).

## Bean Validation: The Spring-Native Layer

```java
import jakarta.validation.constraints.*;

public class CreateLessonRequest {

    @NotBlank(message = "title is required")
    @Size(max = 200, message = "title must be under 200 chars")
    private String title;

    @NotNull(message = "minutes is required")
    @Min(value = 1, message = "minutes must be at least 1")
    @Max(value = 600, message = "minutes must be under 600")
    private Integer minutes;

    @Email(message = "must be a valid email")
    private String instructorEmail;

    @Pattern(regexp = "^(BEGINNER|INTERMEDIATE|ADVANCED)$",
             message = "level must be BEGINNER, INTERMEDIATE, or ADVANCED")
    private String level;

    // getters/setters...
}
```

```java
@RestController
public class LessonController {

    // @Valid triggers the constraints BEFORE the method runs.
    @PostMapping("/lessons")
    public LessonDto create(@Valid @RequestBody CreateLessonRequest req) {
        // If validation fails, Spring throws MethodArgumentNotValidException
        // -> 400 Bad Request, with the messages in the body.
        return lessonService.create(req);
    }
}
```

**Walking through it:** the annotations *declare* the rules (`@NotBlank`, `@Size`, `@Min`/`@Max`, `@Email`, `@Pattern` — the core of the Bean Validation 3.0/Jakarta set). `@Valid` on the parameter triggers validation automatically when the request is deserialized. A violation → `MethodArgumentNotValidException` → Spring's default handler returns **400 with the validation messages** — the request never reaches your service. The result: the boundary rejects bad input *before business logic runs*, which is exactly where validation belongs (the "validate at the boundary" rule from secure coding).

**Handling the errors cleanly:**

```java
@RestControllerAdvice
public class ValidationExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handle(MethodArgumentNotValidException ex) {
        // One entry per violated field — machine-readable errors:
        return ex.getBindingResult().getFieldErrors().stream()
            .collect(java.util.stream.Collectors.toMap(
                e -> e.getField(), e -> e.getDefaultMessage(),
                (a, b) -> a + "; " + b));
        // {"title":"title is required","minutes":"minutes must be at least 1"}
    }
}
```

**The nested-validation tools:** `@Valid` on a *nested object field* cascades validation into it; `@Validated` on the class enables validation on method parameters beyond `@RequestBody` (query params, path variables: `@RequestParam @Min(1) int page`); `@Validated` at the class level also enables `@PreAuthorize`-style constraints. Groups (`@Validated(Create.class)`) express different rules per context ("create vs update").

## JSON Schema: The Contract in a Document

**JSON Schema** describes valid JSON in JSON — a specification your API can *publish* (as the machine-readable API contract) and *enforce*:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["title", "minutes"],
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "minutes": {
      "type": "integer",
      "minimum": 1,
      "maximum": 600
    },
    "level": {
      "type": "string",
      "enum": ["BEGINNER", "INTERMEDIATE", "ADVANCED"]
    }
  },
  "additionalProperties": false
}
```

**The vocabulary:** `type` (object/string/number/integer/array/boolean/null), `required` (must-be-present fields), `properties` (per-field rules), `minLength`/`maxLength`/`pattern` (strings), `minimum`/`maximum`/`multipleOf` (numbers), `enum` (allowed values), `items`/`uniqueItems` (arrays), plus `allOf`/`anyOf`/`oneOf`/`not` (compositions) and `$ref` (reuse). The schema *is* the documentation — tools (Stoplight, Swagger) render it; validators enforce it; other languages read it.

**Enforcing it in Java:**

```java
// networknt's validator (the standard choice):
com.networknt.schema.JsonSchema schema = JsonSchemaFactory
        .getInstance(SpecVersion.VersionFlag.V202012)
        .getSchema(schemaDocument);              // the schema above

Set<com.networknt.schema.ValidationMessage> errors =
        schema.validate(rawJsonNode);            // validate the incoming JSON tree

if (!errors.isEmpty()) {
    errors.forEach(e -> System.out.println(e.getMessage()));
    throw new ValidationException("invalid payload");
}
```

Validation happens *before* deserialization (on the raw JSON tree), so the schema guards the boundary independently of the Java types — the pattern for contract-first APIs, webhooks, and cross-language consumers.

## Schema Generation: Jackson's Side

Jackson can *generate* a schema from your Java types (the reverse direction):

```java
// Generate a draft-07 schema from a POJO:
com.fasterxml.jackson.module.jsonSchema.JsonSchema schema =
        mapper.generateJsonSchema(Lesson.class);
String schemaJson = mapper.writerWithDefaultPrettyPrinter()
                          .writeValueAsString(schema);
```

(With the `jackson-module-jsonSchema` module.) The generated schema reflects your DTO's shape — the starting point for a published contract. The production pattern: **define the contract once** (usually the DTOs), derive what you can (schemas, OpenAPI), and validate both sides — Bean Validation for the request handling, schema validation for the contract-first boundary.

## The Integration Patterns

The full JSON contract stack in a Spring Boot API:

1. **DTOs (records)** — the shape, via Jackson mapping.
2. **Bean Validation annotations** — the rules, enforced at the boundary by `@Valid` (400s with clean messages).
3. **`@RestControllerAdvice`** — consistent error bodies (validation + business exceptions → `{error, message}` shape).
4. **OpenAPI/springdoc** — the *documentation* derived from DTOs + annotations (the openapi-rest-docs module covers this in depth).
5. **JSON Schema (optional)** — the machine-readable contract for cross-language consumers and webhooks.
6. **Logging the rejected payloads' field errors** — audit + debugging (but never log the raw payload with sensitive fields).

## The Anti-Patterns

- **Validation only in the UI** — server-side validation is the real guard; the client is a suggestion.
- **Validating in the service** with manual `if` chains — the annotations are declarative and consistent; manual checks scatter and drift.
- **Trusting deserialization to validate** — Jackson checks *types*, not *rules*; a `-5` in an `Integer` field deserializes fine. Bean Validation is what rejects it.
- **The over-validated DTO** — rules that belong in business logic (a credit limit) shouldn't live in the DTO; validation is for *shape and format*, business rules live in the service.
- **Ignoring the error response shape** — every API should return a consistent, documented error body, not Spring's raw default forever.

## Recap

The contract layer sits between deserialization and business logic: **Bean Validation** (`@NotBlank`, `@Min`, `@Email`, `@Pattern` + `@Valid` at the boundary) rejects invalid requests with clean 400s before services run, and **JSON Schema** expresses the same rules as a machine-readable, publishable contract — enforced pre-deserialization via networknt's validator and generatable from DTOs. The integration stack — DTOs for shape, annotations for rules, `@RestControllerAdvice` for consistent errors, OpenAPI for docs, JSON Schema for cross-language contracts — is how a production API makes its JSON contract explicit at every layer. The discipline: validate at the boundary, keep shape-rules in DTOs and business-rules in services, and make the error response as deliberate as the success one.
