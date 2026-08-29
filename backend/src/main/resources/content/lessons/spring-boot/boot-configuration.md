---
title: Spring Boot Configuration — Properties, YAML, @ConfigurationProperties, and Profiles
summary: application.properties vs application.yml, binding properties to Java objects with @ConfigurationProperties, profile-specific configs, external configuration sources (env vars, command line, config server), validation, and how organizations manage configuration across environments with line-by-line walkthroughs.
order: 5
minutes: 30
topics: [configuration-properties, application-properties, application-yml, profiles, externalized-config, config-validation, config-binding]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.external-config
  - https://docs.spring.io/spring-boot/docs/current/reference/html/application-properties.html
---

# Spring Boot Configuration — Properties, YAML, @ConfigurationProperties, and Profiles

## What is externalized configuration?

**Externalized configuration** means your application's settings (database URL, API keys, port number) are NOT hardcoded in Java. They live in external files (application.properties, environment variables) so you can change them without recompiling.

**Beginner mental model:** Configuration is like the settings on your phone. You don't rewrite the operating system to change your wallpaper — you just change a setting. Similarly, you don't recompile Java to change the database URL — you change a property file.

## application.properties vs application.yml

Both files do the same thing — Spring Boot reads both. YAML (.yml) is more readable for nested configs.

```properties
# application.properties — flat key=value format
server.port=8080
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=postgres
spring.datasource.password=secret
app.feature.max-upload-size=10MB
```

```yaml
# application.yml — hierarchical YAML format (same thing, more readable)
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: postgres
    password: secret

app:
  feature:
    max-upload-size: 10MB
```

## Reading properties with @Value

```java
// @Value reads a single property and injects it into a field
@Service
public class EmailService {

    @Value("${app.email.smtp-host}")         // reads app.email.smtp-host from properties
    private String smtpHost;

    @Value("${app.email.smtp-port:587}")     // :587 is the DEFAULT value if not set
    private int smtpPort;

    @Value("${app.email.enabled:true}")      // default: true
    private boolean enabled;

    // SpEL expressions work too
    @Value("#{${app.email.recipients}.split(',')}")  // splits comma-separated list
    private List<String> defaultRecipients;
}
```

## @ConfigurationProperties — binding entire config blocks

```java
// Instead of multiple @Value annotations, bind an entire prefix to a typed object
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
    String provider,           // app.storage.provider
    String bucket,             // app.storage.bucket
    int maxFileSize,           // app.storage.max-file-size
    List<String> allowedTypes  // app.storage.allowed-types
) {}

// OR using @ConfigurationProperties with a class:
@ConfigurationProperties(prefix = "app.storage")
public class StorageProperties {
    private String provider;
    private String bucket;
    private int maxFileSize;
    private List<String> allowedTypes;

    // getters and setters (or records — no getters/setters needed)
}

// application.yml
app:
  storage:
    provider: s3
    bucket: my-app-uploads
    max-file-size: 10485760    # 10MB in bytes
    allowed-types:
      - image/png
      - image/jpeg
      - application/pdf
```

**Enable the binding:**
```java
@SpringBootApplication
@EnableConfigurationProperties(StorageProperties.class)  // bind StorageProperties
public class AcademyApplication { ... }

// OR use @ConfigurationPropertiesScan to auto-scan all @ConfigurationProperties classes
@SpringBootApplication
@ConfigurationPropertiesScan    // auto-discovers all @ConfigurationProperties
public class AcademyApplication { ... }
```

## Profile-specific configuration

```yaml
# application.yml (always loaded — common defaults)
spring:
  jpa:
    hibernate:
      ddl-auto: validate

logging:
  level:
    root: INFO

# application-dev.yml (loaded when profile=dev is active)
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/devdb
    username: dev
    password: dev
  jpa:
    show-sql: true        # log SQL in dev
    hibernate:
      ddl-auto: update   # auto-create/update tables in dev

logging:
  level:
    com.backendforge: DEBUG

# application-prod.yml (loaded when profile=prod is active)
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/proddb
    username: ${DB_USER}    # from environment variable
    password: ${DB_PASS}    # from environment variable
  jpa:
    show-sql: false
    hibernate:
      ddl-auto: validate   # only validate schema in prod

logging:
  level:
    root: WARN
    com.backendforge: INFO
```

```bash
# Activate profiles:
java -jar app.jar --spring.profiles.active=prod     # command line
SPRING_PROFILES_ACTIVE=prod java -jar app.jar         # environment variable
```

```yaml
# Profile groups — activate multiple profiles with one name
spring:
  profiles:
    group:
      production: prod,metrics,audit     # --spring.profiles.active=production activates all three
      development: dev,debug,local
```

## External configuration sources (priority order)

Spring Boot checks multiple locations, in this priority order (highest first):

```java
// 1. Command-line arguments (highest priority)
// java -jar app.jar --server.port=9090

// 2. SPRING_APPLICATION_JSON environment variable
// export SPRING_APPLICATION_JSON='{"server":{"port":9090}}'

// 3. OS environment variables
// export SERVER_PORT=9090

// 4. application-{profile}.yml
// 5. application.yml
// 6. @PropertySource annotations
// 7. Default properties (lowest priority)
```

```java
// Example: environment variable overrides application.yml
// application.yml says: server.port=8080
// Environment variable says: SERVER_PORT=9090
// Result: server runs on 9090 (env var wins!)
```

## Validation with @Validated

```java
@ConfigurationProperties(prefix = "app.payment")
@Validated    // enables Bean Validation on the properties
public class PaymentProperties {

    @NotBlank(message = "Payment provider is required")
    private String provider;

    @Min(value = 1, message = "Timeout must be at least 1 second")
    private int timeoutSeconds;

    @Pattern(regexp = "^sk_(test|live)_.+$", message = "API key must start with sk_test_ or sk_live_")
    private String apiKey;

    // getters and setters
}

// If validation fails at startup:
// Binding failure: Invalid value for 'app.payment.provider': must not be blank
// Application FAILS TO START — you catch config errors immediately!
```

## How we use it in organizations

### Scenario 1: Feature flags via configuration

```java
@ConfigurationProperties(prefix = "app.features")
public record FeatureFlags(
    boolean registrationEnabled,
    boolean aiTutorEnabled,
    int maxCoursesPerUser,
    String maintenanceMessage
) {}

@Service
public class RegistrationService {
    private final FeatureFlags features;

    public RegistrationService(FeatureFlags features) {
        this.features = features;
    }

    public User register(RegisterRequest req) {
        if (!features.registrationEnabled()) {
            throw new FeatureDisabledException("Registration is currently disabled");
        }
        // ... registration logic
    }
}

# application.yml
app:
  features:
    registration-enabled: true
    ai-tutor-enabled: true
    max-courses-per-user: 50
    maintenance-message: ""

# application-prod.yml
app:
  features:
    max-courses-per-user: 20   # stricter limit in production
```

### Scenario 2: Secrets management

```java
// NEVER put secrets in application.yml (it's in source control!)
// Use environment variables instead:

// application.yml — reference env vars with ${}
spring:
  datasource:
    password: ${DB_PASSWORD}     # reads from environment variable at runtime

app:
  openai:
    api-key: ${OPENAI_API_KEY}   # reads from environment variable

// In Render/Vercel/Heroku, set these as environment variables in the dashboard
// They never appear in your code or config files
```

### Scenario 3: Configuration for multiple environments

```yaml
# application.yml
spring:
  profiles:
    active: dev    # default profile

app:
  cors:
    allowed-origins: ${CORS_ORIGINS:http://localhost:5173}  # env var with fallback

# application-dev.yml
app:
  cors:
    allowed-origins: http://localhost:5173,http://localhost:3000

# application-staging.yml
app:
  cors:
    allowed-origins: https://staging.techie-backend-forge.vercel.app

# application-prod.yml
app:
  cors:
    allowed-origins: https://techie-backend-forge.vercel.app
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Hardcoding secrets in application.yml | Secret leaked to source control | Use environment variables |
| No @Validated on @ConfigurationProperties | Invalid config values accepted silently | Add validation annotations |
| Using @Value for many related properties | Scattered config, hard to maintain | Group into @ConfigurationProperties |
| Not using profiles | Dev config leaks into production | Always use profile-specific files |
| Ignoring property override order | Unexpected values at runtime | Understand the priority chain |
| Using application.properties AND application.yml | Confusing conflicts | Pick one and stick with it |
