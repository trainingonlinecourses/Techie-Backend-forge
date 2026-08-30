---
title: "Profile-Specific Configuration — One Codebase, Many Environments"
summary: "How Spring profiles work, activating profiles, profile-specific properties, YAML multi-document format, and how organizations manage dev/test/prod configurations."
order: 2
minutes: 18
topics: [profiles, profile-specific-config, yaml-profiles, active-profile, conditional-beans, environment]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.profiles
  - https://docs.spring.io/spring-framework/reference/core/beans/environment.html
---

## The Concept, From Zero

### What are Spring Profiles?

**Profiles = different configurations for different environments.** You write one codebase but run it differently in dev, test, and production.

Without profiles:
```properties
# application.properties — one file for everything
server.port=8080
database.url=localhost:5432/mydb
database.password=dev123
# ↑ Works in dev, but what about production?
# ↑ You'd need to manually change these for each environment
```

With profiles:
```properties
# application.properties — shared config
spring.profiles.active=dev

# application-dev.properties — development
server.port=8080
database.url=localhost:5432/mydb_dev

# application-prod.properties — production
server.port=443
database.url=prod-db.example.com:5432/mydb
```

### How to Activate Profiles

**Option 1: application.properties**
```properties
spring.profiles.active=dev
```

**Option 2: Command line**
```bash
java -jar app.jar --spring.profiles.active=prod
```

**Option 3: Environment variable**
```bash
export SPRING_PROFILES_ACTIVE=prod
```

**Option 4: Programmatic**
```java
SpringApplication app = new SpringApplication(App.class);
app.setAdditionalProfiles("dev");
app.run(args);
```

### YAML Multi-Document Format

```yaml
# application.yml — all profiles in one file
server:
  port: 8080

---
# Development profile
spring.config.activate.on-profile: dev
server:
  port: 8080
  debug: true
logging:
  level:
    com.example: DEBUG

---
# Production profile
spring.config.activate.on-profile: prod
server:
  port: 443
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
logging:
  level:
    com.example: INFO
```

### Profile-Specific Beans

```java
@Configuration
public class DataSourceConfig {
    
    @Bean
    @Profile("dev")
    public DataSource devDataSource() {
        // H2 in-memory database for development
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .build();
    }
    
    @Bean
    @Profile("prod")
    public DataSource prodDataSource() {
        // PostgreSQL for production
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(System.getenv("DB_URL"));
        config.setUsername(System.getenv("DB_USER"));
        config.setPassword(System.getenv("DB_PASS"));
        return new HikariDataSource(config);
    }
}
```

### Organization Use Cases

**1. Environment-Specific Logging**
```properties
# application-dev.properties
logging.level.root=DEBUG
logging.level.org.hibernate.SQL=DEBUG

# application-prod.properties
logging.level.root=WARN
logging.level.org.hibernate.SQL=ERROR
```

**2. Feature Flags**
```properties
# application-dev.properties
features.dark-mode=true
features.experimental-api=true

# application-prod.properties
features.dark-mode=true
features.experimental-api=false
```

**3. External Service URLs**
```properties
# application-dev.properties
payment.gateway.url=http://localhost:9090/mock
email.service.url=http://localhost:8082/mock

# application-prod.properties
payment.gateway.url=https://api.stripe.com/v1
email.service.url=https://api.sendgrid.com/v3
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Hardcoding environment values | Different config for each deploy | Use profile-specific properties |
| No default profile | App crashes if profile not set | Set a safe default in application.properties |
| Mixing env-specific data in code | Can't change without recompiling | Externalize to properties files |
| Forgetting profile-specific secrets | Secrets in main config visible in git | Use environment variables for secrets |

### Line-by-Line Code Explanation

```java
@SpringBootApplication
// ↑ Main application class — Spring Boot entry point

public class AcademyApplication {
    
    public static void main(String[] args) {
        // ↑ Standard Java main method
        
        SpringApplication app = new SpringApplication(AcademyApplication.class);
        // ↑ Create SpringApplication instance
        // ↑ Don't call run() yet — we need to configure profiles first
        
        String activeProfile = System.getenv().getOrDefault("SPRING_PROFILES_ACTIVE", "dev");
        // ↑ Get profile from environment variable
        // ↑ Default to "dev" if not set
        // ↑ In production, set SPRING_PROFILES_ACTIVE=prod
        
        app.setAdditionalProfiles(activeProfile);
        // ↑ Set the active profile programmatically
        // ↑ This overrides any spring.profiles.active in properties files
        
        app.run(args);
        // ↑ Start the application with the configured profile
        // ↑ Spring loads application-{profile}.properties automatically
    }
}
```

### Key Takeaways

1. **Profiles separate configuration** — one codebase, many environments
2. **`spring.profiles.active`** — activates one or more profiles
3. **`application-{profile}.properties`** — profile-specific overrides
4. **`@Profile` annotation** — conditionally load beans per profile
5. **YAML multi-document** — multiple profiles in one file with `---`
6. **Default profile** — always set a safe default in `application.properties`

### Real-World Organization Scenario

A SaaS company runs the same Spring Boot app in 4 environments: local dev, staging, production-us, production-eu. Each profile configures database URLs, cache TTLs, email providers, and feature flags. Developers use `dev` profile with H2 and mock services. Staging uses real services but with test data. Production profiles use real databases with proper credentials (injected via Kubernetes secrets).
