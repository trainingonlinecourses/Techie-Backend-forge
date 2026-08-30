---
title: Protocol Buffers Fundamentals
module: grpc-apis
order: 1
minutes: 22
topics: ["protobuf", ".proto files", "message types", "scalar types", "repeated", "oneof", "serialization"]
docs:
  - title: "Protobuf language guide"
    url: "https://protobuf.dev/programming-guides/proto3/"
summary: Protocol Buffers (protobuf) is Google's binary serialization format — the contract language of gRPC. Where JSON is humanreadable and wasteful, prot...
---

# Protocol Buffers Fundamentals

Protocol Buffers (protobuf) is Google's binary serialization format — the contract language of gRPC. Where JSON is human-readable and wasteful, protobuf is compact, fast, versioned, and code-generated. This lesson covers the `.proto` language itself; gRPC builds on it next.

## Why Binary Serialization

| | JSON | Protobuf |
|--|------|----------|
| Size | Verbose (keys repeated per field) | Compact (numeric field tags) |
| Speed | Text parsing | Binary, generated code |
| Schema | Implicit, weak | Explicit, versioned |
| Typing | Weak | Strong, compiled |
| Versioning | Manual | Built-in (field numbers) |

A typical JSON payload of ~400 bytes becomes ~60 bytes in protobuf — 6–7× smaller, parsing ~10× faster.

## The .proto File

```proto
syntax = "proto3";

package academy.v1;

option java_package = "com.academy.proto";
option java_multiple_files = true;

message Course {
  int64 id = 1;
  string title = 2;
  string level = 3;
  int32 minutes = 4;
  repeated string tags = 5;
  Status status = 6;
}

enum Status {
  STATUS_UNSPECIFIED = 0;
  DRAFT = 1;
  PUBLISHED = 2;
  ARCHIVED = 3;
}
```

**The field numbers (1, 2, 3...) are the contract.** They become the binary tags — rename a field freely, but never reuse a number.

## Scalar Types

| .proto | Java | Notes |
|--------|------|-------|
| `int32` / `int64` | int / long | Variable-length encoding |
| `uint32` / `uint64` | int / long | Non-negative values |
| `sint32` / `sint64` | int / long | Signed, zigzag (negative-heavy) |
| `fixed32` / `fixed64` | int / long | Fixed 4/8 bytes — faster for large numbers |
| `float` / `double` | float / double | IEEE |
| `bool` | boolean | |
| `string` | String | UTF-8 |
| `bytes` | ByteString | Raw binary |

## Repeated: Lists

```proto
message Course {
  repeated string tags = 5;        // list, any order
  repeated Lesson lessons = 6;     // repeated messages
}
```

```java
Course course = Course.newBuilder()
    .addTags("java")
    .addAllTags(List.of("spring", "boot"))
    .build();

List<String> tags = course.getTagsList();   // immutable view
```

## Nested Messages

```proto
message Course {
  message Author {
    string name = 1;
    string email = 2;
  }
  Author author = 7;
}
```

```java
Course.Author author = Course.Author.newBuilder()
    .setName("Ada").setEmail("ada@example.com").build();
```

## oneof: Exactly One Field

```proto
message Payment {
  oneof method {
    string card_token = 1;
    string bank_iban = 2;
    string wallet_id = 3;
  }
}
```

```java
Payment p = Payment.newBuilder().setCardToken("tok_123").build();
// Setting bankIban clears cardToken — only one is set
```

## Maps

```proto
message Metadata {
  map<string, string> labels = 1;
}
```

```java
Metadata m = Metadata.newBuilder()
    .putLabels("env", "prod")
    .putLabels("region", "us-east")
    .build();
```

## Defaults in proto3

Proto3 fields have **implicit defaults** — no `null`:

| Type | Default |
|------|---------|
| numeric | 0 |
| bool | false |
| string | "" |
| enum | first value (0) |
| message | absent (use `hasField()` to check presence) |

```java
course.hasAuthor();    // presence check for messages
```

This is why the enum's first value must be a meaningful default (`STATUS_UNSPECIFIED = 0`), not a real state.

## Versioning: The Field Number Contract

Rules for evolving messages:

1. **Never reuse a field number** — old binaries misparse
2. **Never change a field's type** (breaks wire format)
3. **Add** new fields with unused numbers — old readers ignore them
4. **Remove** fields — mark `reserved` so numbers can't be reused:

```proto
message Course {
  reserved 2, 15, 9 to 11;      // these numbers are dead forever
  reserved "obsolete_field";
  string title = 1;              // still fine
  string level = 3;
}
```

## Generated Code

```xml
<dependency>
    <groupId>com.google.protobuf</groupId>
    <artifactId>protobuf-java</artifactId>
    <version>3.25.5</version>
</dependency>
```

```xml
<plugin>
    <groupId>org.xolstice.maven.plugins</groupId>
    <artifactId>protobuf-maven-plugin</artifactId>
    <version>0.6.1</version>
    <configuration>
        <protocArtifact>com.google.protobuf:protoc:3.25.5:exe:${os.detected.classifier}</protocArtifact>
    </configuration>
    <executions>
        <execution>
            <goals><goal>compile</goal><goal>test-compile</goal></goals>
        </execution>
    </executions>
</plugin>
```

Maven compiles `.proto` files in `src/main/proto/` into Java builders. The generated code is immutable, thread-safe, and always in sync with the schema.

## Serialization Round-Trip

```java
Course course = Course.newBuilder()
    .setId(1L).setTitle("Spring Boot").setMinutes(25)
    .addTags("java").addTags("spring")
    .build();

// Serialize
byte[] bytes = course.toByteArray();       // ~40 bytes
ByteString bs = course.toByteString();
String base64 = Base64.getEncoder().encodeToString(bytes);

// Deserialize
Course parsed = Course.parseFrom(bytes);
assertEquals(course, parsed);              // deterministic equality

// JSON interop (protobuf-java-util)
String json = JsonFormat.printer().print(course);
Course fromJson = JsonFormat.parser().parse(json, Course.class);
```

## Testing Protobuf

```java
@Test
void roundTripsThroughBinary() throws Exception {
    Course original = courseBuilder().build();

    byte[] bytes = original.toByteArray();
    Course parsed = Course.parseFrom(bytes);

    assertEquals(original, parsed);
}

@Test
void oneofSetsExactlyOneField() {
    Payment p = Payment.newBuilder().setCardToken("tok").setBankIban("iban").build();
    assertFalse(p.hasCardToken());   // setting the second cleared the first
    assertTrue(p.hasBankIban());
}
```

## Summary

| Concept | Key fact |
|---------|----------|
| Wire format | Field numbers + values — compact binary |
| Defaults | proto3: zero values, no null |
| Lists | `repeated` |
| Exclusivity | `oneof` |
| Presence | `hasField()` for messages |
| Versioning | Field numbers are the contract — never reuse |
| Generated code | Immutable builders via protoc |

Protobuf is the contract layer: schema-first, versioned, compiled, and 6× smaller than JSON. It's the substrate for gRPC — the next lessons put these messages on the wire with typed RPCs, streaming, and error codes.
