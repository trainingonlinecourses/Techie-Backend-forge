---
title: Spring Profiles — Environment-Specific Configuration
summary: What profiles are, activating profiles, profile-specific properties, @Profile annotation, YAML multi-document, and how organizations manage dev/test/prod configurations.
order: 1
minutes: 25
topics: [profiles, configuration, environment, yaml, @profile, application-properties]
docs:
  - https://docs.spring.io/spring-boot/reference/features/profiles.html
---

## The Concept, From Zero

Different environments need different configurations:
- **Dev**: local database, debug logging, mock external services
- **Test**: in-memory database, test timeouts, stubbed APIs
- **Prod**: real database, warn logging, real API keys

**Profiles** let you define environment-specific settings without changing code:

```yaml
# application.yml (shared)
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb

---
# application-dev.yml (dev only)
spring:
  config:
    activate:
      on-profile: dev
  datasource:
    url: jdbc:h2:mem:testdb
  jpa:
    show-sql: true

---
# application-prod.yml (prod only)
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:postgresql://prod-server:5432/mydb
  jpa:
    show-sql: false
```

---

## Activating Profiles

```bash
# Command line
java -jar app.jar --spring.profiles.active=prod

# Environment variable
SPRING_PROFILES_ACTIVE=prod

# application.yml
spring:
  profiles:
    active: dev
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.context.annotation.*;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.stereotype.Service;

// Line 1: Profile-specific beans
@Configuration
public class AppConfig {

    @Bean
    @Profile("dev")
    public DataSource devDataSource() {
        // H2 in-memory database for development
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .addScript("schema.sql")
            .build();
    }

    @Bean
    @Profile("prod")
    public DataSource prodDataSource() {
        // Real PostgreSQL for production
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(System.getenv("DB_URL"));
        config.setUsername(System.getenv("DB_USER"));
        config.setPassword(System.getenv("DB_PASS"));
        return new HikariDataSource(config);
    }

    @Bean
    @Profile("!prod")  // Everything except prod
    public DataSource testDataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .build();
    }
}

// Line 2: Profile-specific service implementations
@Service
@Profile("dev")
public class MockEmailService implements EmailService {
    @Override
    public void send(String to, String subject, String body) {
        System.out.println("[DEV] Email to " + to + ": " + subject);
    }
}

@Service
@Profile("prod")
public class SmtpEmailService implements EmailService {
    @Override
    public void send(String to, String subject, String body) {
        // Real SMTP implementation
        mailSender.send(to, subject, body);
    }
}

// Line 3: Profile-specific properties
// application.yml
spring:
  profiles:
    active: dev

---
spring:
  config:
    activate:
      on-profile: dev
server:
  port: 8080
logging:
  level:
    com.acme: DEBUG

---
spring:
  config:
    activate:
      on-profile: prod
server:
  port: 443
logging:
  level:
    com.acme: INFO

---
spring:
  config:
    activate:
      on-profile: test
server:
  port: 0  # random port
spring:
  datasource:
    url: jdbc:h2:mem:testdb

// Line 4: Checking active profiles
@Service
public class ProfileChecker {
    private final ConfigurableEnvironment environment;

    public ProfileChecker(ConfigurableEnvironment environment) {
        this.environment = environment;
    }

    public boolean isProduction() {
        return Arrays.asList(environment.getActiveProfiles()).contains("prod");
    }

    public boolean isDevelopment() {
        return Arrays.asList(environment.getActiveProfiles()).contains("dev");
    }

    public String getActiveProfile() {
        String[] profiles = environment.getActiveProfiles();
        return profiles.length > 0 ? profiles[0] : "default";
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Multi-region deployment

```yaml
# application.yml
spring:
  profiles:
    active: default

---
spring:
  config:
    activate:
      on-profile: us-east
  cloud:
    aws:
      region: us-east-1

---
spring:
  config:
    activate:
      on-profile: eu-west
  cloud:
    aws:
      region: eu-west-1
```

### Scenario 2: Feature flags with profiles

```yaml
# application.yml
features:
  new-checkout: false
  dark-mode: false

---
spring:
  config:
    activate:
      on-profile: beta
features:
  new-checkout: true
  dark-mode: true

---
spring:
  config:
    activate:
      on-profile: canary
features:
  new-checkout: true
```

```java
@Component
public class FeatureFlags {
    @Value("${features.new-checkout:false}")
    private boolean newCheckoutEnabled;

    @Value("${features.dark-mode:false}")
    private boolean darkModeEnabled;

    public boolean isNewCheckoutEnabled() {
        return newCheckoutEnabled;
    }
}
```

### Scenario 3: Test profile with embedded database

```java
@SpringBootTest
@ActiveProfiles("test")
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldSaveAndRetrieveUser() {
        User user = new User("test@example.com", "Test User");
        userRepository.save(user);

        Optional<User> found = userRepository.findByEmail("test@example.com");
        assertThat(found).isPresent();
        assertThat(found.get().getName()).isEqualTo("Test User");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `@Profile` | Bean created for all environments | Add profile annotation to environment-specific beans |
| Hardcoding profile names | Typos cause issues | Use constants or enums |
| Not having a default profile | Missing configuration | Always provide default `application.yml` |
| Profile-specific beans overriding wrong | Wrong bean loaded | Check profile activation order |
| Using `@Profile("!prod")` carelessly | Unintended beans in test | Be explicit about profile conditions |
