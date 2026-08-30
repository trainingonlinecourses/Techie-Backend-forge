---
title: Nested Configuration Properties — Complex Config Structures
summary: How to bind nested YAML/properties into Java objects, @Validated nested objects, map-based config, and list binding.
order: 4
minutes: 15
topics: [nested-properties, list-binding, map-binding, complex-config, groups]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties
---

## The Concept, From Zero

Configuration properties can be nested — YAML maps to Java objects. Spring Boot handles this automatically with `@ConfigurationProperties`.

```yaml
app:
  mail:
    host: smtp.example.com
    port: 587
    ssl:
      enabled: true
      protocol: TLS
```

```java
@Data
@ConfigurationProperties(prefix = "app.mail")
public class MailProperties {
    private String host;
    private int port;
    private Ssl ssl = new Ssl();  // nested object

    @Data
    public static class Ssl {
        private boolean enabled;
        private String protocol;
    }
}
```

---

## Line-by-Line Walkthrough

```java
@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    // 1. Simple nested object
    private Database database = new Database();

    // 2. List binding
    private List<String> allowedOrigins = new ArrayList<>();

    // 3. Map binding
    private Map<String, Feature> features = new HashMap<>();

    // 4. List of objects
    private List<Server> servers = new ArrayList<>();

    @Data
    public static class Database {
        private String url;
        private String username;
        private String password;
        private Pool pool = new Pool();

        @Data
        public static class Pool {
            private int maxSize = 10;
            private int minIdle = 2;
        }
    }

    @Data
    public static class Feature {
        private boolean enabled;
        private String description;
    }

    @Data
    public static class Server {
        private String host;
        private int port;
    }
}
```

### YAML Configuration

```yaml
app:
  database:
    url: jdbc:postgresql://localhost:5432/mydb
    username: admin
    password: secret
    pool:
      max-size: 20
      min-idle: 5

  allowed-origins:
    - http://localhost:3000
    - https://example.com

  features:
    search:
      enabled: true
      description: Full-text search
    dark-mode:
      enabled: false
      description: Dark mode UI

  servers:
    - host: server1.example.com
      port: 8080
    - host: server2.example.com
      port: 8081
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not initializing nested objects | NullPointerException | Initialize with `new NestedClass()` |
| Wrong key names | Properties not bound | Match YAML keys exactly (kebab-case) |
| Forgetting @Data on nested class | Getters/setters missing | Add @Data to all nested classes |
| Using lists without defaults | Empty list, not null | Initialize with `new ArrayList<>()` |
