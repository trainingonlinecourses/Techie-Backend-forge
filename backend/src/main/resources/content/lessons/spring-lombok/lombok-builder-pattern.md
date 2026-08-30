---
title: Builder Pattern — @Builder Deep Dive
summary: How @Builder works, custom builder names, builder inheritance, @SuperBuilder, and when to use builders vs constructors vs records.
order: 3
minutes: 15
topics: [@Builder, @SuperBuilder, builder-inheritance, factory-method, records]
docs:
  - https://projectlombok.org/features/Builder
---

## The Concept, From Zero

The Builder pattern lets you construct complex objects step by step. Lombok's `@Builder` generates the builder class and all the chaining methods automatically.

```java
@Builder
public class Server {
    private String host;
    private int port;
    private boolean ssl;
    private Duration timeout;
}

// Usage
Server server = Server.builder()
    .host("localhost")
    .port(8080)
    .ssl(true)
    .timeout(Duration.ofSeconds(30))
    .build();
```

---

## @Builder Options

### On class (all fields)

```java
@Builder
public class User {
    private String name;
    private int age;
}
```

### On factory method

```java
public class User {
    private String name;
    private int age;

    @Builder
    public static User create(String name, int age) {
        return new User(name, age);
    }
}
```

### Custom builder name

```java
@Builder(builderClassName = "ConfigBuilder")
public class Config { }
// Generates: Config.ConfigBuilder, not Config.UserBuilder
```

### With default values

```java
@Builder.Default
private int maxRetries = 3;

@Builder.Default
private Duration timeout = Duration.ofSeconds(30);
```

---

## Line-by-Line Walkthrough

```java
import lombok.*;
import java.time.Duration;
import java.util.*;

public class BuilderDemo {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HttpClient {
        private String baseUrl;
        private int connectTimeout;
        private int readTimeout;
        @Builder.Default
        private boolean followRedirects = true;
        @Builder.Default
        private Map<String, String> defaultHeaders = new HashMap<>();
    }

    public static void main(String[] args) {
        // 1. Basic builder
        HttpClient client = HttpClient.builder()
            .baseUrl("https://api.example.com")
            .connectTimeout(5000)
            .readTimeout(30000)
            .build();
        System.out.println(client);  // followRedirects=true, defaultHeaders={}

        // 2. Override defaults
        HttpClient custom = HttpClient.builder()
            .baseUrl("https://other.com")
            .connectTimeout(1000)
            .readTimeout(5000)
            .followRedirects(false)
            .defaultHeaders(Map.of("Authorization", "Bearer token"))
            .build();

        // 3. Copy and modify
        HttpClient modified = client.toBuilder()
            .baseUrl("https://new-api.com")
            .build();
    }
}
```

---

## @SuperBuilder (Inheritance)

```java
@Data
@SuperBuilder
public class Animal {
    private String name;
    private int age;
}

@Data
@SuperBuilder(callSuper = true)
public class Dog extends Animal {
    private String breed;
}

// Usage
Dog dog = Dog.builder()
    .name("Rex")
    .age(3)
    .breed("Labrador")
    .build();
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| @Builder without @NoArgsConstructor | Can't deserialize from Jackson | Add @NoArgsConstructor + @AllArgsConstructor |
| Forgetting @Builder.Default | Default values ignored | Always use @Builder.Default |
| Using builder for simple DTOs | Over-engineering | Use records or @Data for simple POJOs |
| Not using toBuilder() | Can't modify existing objects | Add toBuilder = true |
