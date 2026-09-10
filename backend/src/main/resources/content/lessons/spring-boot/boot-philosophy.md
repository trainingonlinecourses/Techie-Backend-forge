---
title: What is Spring Boot — Why It Exists, How It Differs from Spring, and Auto-Configuration
summary: Plain Spring's configuration pain, what Spring Boot solves (embedded servers, auto-configuration, starters, opinionated defaults), how @SpringBootApplication works under the hood, and why every production Java team uses it with line-by-line walkthroughs.
order: 8
minutes: 25
topics: [spring-boot, auto-configuration, starter-parent, embedded-server, convention-over-configuration, spring-vs-spring-boot]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/getting-started.html
  - https://docs.spring.io/spring-boot/docs/current/reference/html/using-boot.html
---

# What is Spring Boot — Why It Exists, How It Differs from Spring, and Auto-Configuration

## The problem Spring Boot solves

Before Spring Boot, setting up a Spring application required:
1. Creating XML configuration files (hundreds of lines).
2. Manually configuring every bean (datasource, EntityManager, view resolver).
3. Deploying to an external server (Tomcat, Jetty) — download WAR, configure it, deploy.
4. Adding dozens of dependencies with exact version numbers.

**Beginner mental model:** Spring Boot is like ordering a complete meal at a restaurant instead of shopping for ingredients, cooking, and plating yourself. Spring gave you the ingredients; Spring Boot gives you the full meal with a recipe.


**What this code does — step by step:**

1. BEFORE Spring Boot (traditional Spring): 1. web.xml — 50 lines of XML to configure a servlet. 2. applicationContext.xml — 100 lines to configure beans. 3. pom.xml — 30 dependencies with exact versions. 4. Deploy WAR to Tomcat manually. Total: ~3 hours to get a "Hello World" running
2. AFTER Spring Boot:
3. `@SpringBootApplication` — one annotation does everything
4. `SpringApplication.run(MyApp.class, args);` — runs the app with embedded Tomcat
5. Run: mvn spring-boot:run. Total: 5 minutes to get "Hello World" running

The same code, clean:

```java
@SpringBootApplication
public class MyApp {
    public static void main(String[] args) {
        SpringApplication.run(MyApp.class, args);
    }
}

@RestController
public class HelloController {
    @GetMapping("/hello")
    public String hello() {
        return "Hello, World!";
    }
}
```

## What @SpringBootApplication actually does


**What this code does — step by step:**

1. `@SpringBootApplication` — THIS IS THE MAGIC ANNOTATION
2. It's actually THREE annotations combined:
3. `@SpringBootConfiguration` — marks this class as a configuration class (like @Configuration)
4. `@EnableAutoConfiguration` — tells Spring Boot to automatically configure beans
5. `@ComponentScan` — scans this package and sub-packages for @Component, @Service, etc.
6. Equivalent to:

The same code, clean:

```java
@SpringBootApplication

@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan

@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(basePackages = "com.backendforge.academy")
public class AcademyApplication { ... }
```

### How auto-configuration works


**What this code does — step by step:**

1. Spring Boot ships with "auto-configuration classes" — one for each technology: DataSourceAutoConfiguration — configures database connection if H2/PostgreSQL is on classpath. JacksonAutoConfiguration — configures JSON serialization if Jackson is on classpath. SecurityAutoConfiguration — configures security if Spring Security is on classpath
2. Example: DataSourceAutoConfiguration
3. `@ConditionalOnClass(DataSource.class)` — ONLY load if DataSource class exists
4. `@ConditionalOnProperty(name = "spring.datasource.url")` — ONLY if datasource URL is configured
5. `@ConditionalOnMissingBean` — ONLY create if you haven't defined your own
6. `.url(properties.getUrl())` — reads from application.properties
7. YOU don't configure the DataSource — Spring Boot does it automatically! Just add postgresql to your pom.xml and set spring.datasource.url in properties

The same code, clean:

```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)
@ConditionalOnProperty(name = "spring.datasource.url")
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public DataSource dataSource(DataSourceProperties properties) {
        return DataSourceBuilder.create()
            .url(properties.getUrl())
            .username(properties.getUsername())
            .password(properties.getPassword())
            .build();
    }
}
```

## Convention over Configuration

```yaml
# application.yml — Spring Boot's opinionated defaults
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb  # convention: "spring.datasource.url" = DB URL
    username: postgres
    password: secret

  jpa:
    hibernate:
      ddl-auto: update    # convention: auto-create/update tables

server:
  port: 8080               # convention: default port is 8080

logging:
  level:
    root: INFO
    com.backendforge: DEBUG   # convention: package-specific logging
```

**The convention:** If you follow Spring Boot's naming conventions (like `spring.datasource.url`), it configures everything automatically. You only override what differs from the defaults.

## Embedded servers — no external Tomcat needed


**What this code does — step by step:**

1. Traditional Spring: deploy WAR to external Tomcat. Mvn package → creates app.war → copy to Tomcat/webapps → restart Tomcat
2. Spring Boot: embedded Tomcat — runs inside your app. Mvn package → creates app.jar → java -jar app.jar → done!
3. Spring Boot includes embedded Tomcat, Jetty, or Undertow: pom.xml
4. `<artifactId>spring-boot-starter-web</artifactId>` — includes embedded Tomcat
5. To use Jetty instead of Tomcat:

The same code, clean:

```java
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

## Starters — dependency bundles


**What this code does — step by step:**

1. Instead of adding 10 separate dependencies: spring-core, spring-web, spring-mvc, jackson-databind, tomcat-embed, ...
2. Spring Boot provides "starters" — bundles of related dependencies:
3. `<artifactId>spring-boot-starter-web</artifactId>` — adds Spring MVC + Jackson + Tomcat
4. `<artifactId>spring-boot-starter-data-jpa</artifactId>` — adds Spring Data JPA + Hibernate
5. `<artifactId>spring-boot-starter-security</artifactId>` — adds Spring Security
6. `<artifactId>spring-boot-starter-test</artifactId>` — adds JUnit 5 + Mockito + AssertJ

The same code, clean:

```java
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
</dependency>
```

## How we use it in organizations

### Scenario 1: Creating a new microservice in minutes


**What this code does — step by step:**

1. Step 1: Go to start.spring.io, select: Web, Data JPA, PostgreSQL, Security. Step 2: Download, unzip, open in IDE. Step 3: Write your first endpoint
2. `public UserController(UserService userService) {` — constructor injection
3. `return userService.findAll();` — returns list of users as JSON
4. `return userService.findById(id);` — returns single user as JSON
5. `return ResponseEntity.status(201).body(created);` — 201 Created
6. application.yml
7. `url: jdbc:postgresql:` — localhost:5432/userdb
8. That's it. You now have a full REST API with: ✅ JSON serialization (Jackson). ✅ Database access (JPA + Hibernate). ✅ Validation (@Valid). ✅ Security (Spring Security — add @EnableWebSecurity). ✅ Embedded Tomcat. ✅ Health checks (/actuator/health)

The same code, clean:

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserResponse> getAllUsers() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
        UserResponse created = userService.create(req);
        return ResponseEntity.status(201).body(created);
    }
}

spring:
  datasource:
    url: jdbc:postgresql:
    username: postgres
    password: secret
  jpa:
    hibernate:
      ddl-auto: validate  # validate schema in production
```

### Scenario 2: Profile-based configuration

```yaml
# application.yml (always loaded)
spring:
  datasource:
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate

# application-dev.yml (dev environment)
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/devdb
    username: dev
    password: dev
  jpa:
    show-sql: true  # log SQL queries in dev

# application-prod.yml (production)
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/proddb
    username: ${DB_USER}    # from environment variable
    password: ${DB_PASS}    # from environment variable
  jpa:
    show-sql: false

# Activate profile: java -jar app.jar --spring.profiles.active=prod
```

### Scenario 3: Custom auto-configuration for your organization

// Create a shared library that auto-configures common patterns
@AutoConfiguration
@ConditionalOnClass(MetricsService.class)
@EnableConfigurationProperties(MetricsProperties.class)
public class MetricsAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MeterRegistryCustomizer<PrometheusMeterRegistry> metricsCustomizer(
            MetricsProperties props) {
        return registry -> registry.config()
            .commonTags("application", props.getAppName())
            .commonTags("environment", props.getEnv());
    }
}

// Register it in META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports:
com.backendforge.metrics.MetricsAutoConfiguration

## Spring vs Spring Boot — quick comparison

| Aspect | Spring Framework | Spring Boot |
|---|---|---|
| Configuration | XML or @Configuration | Auto-configuration + properties |
| Server | External (Tomcat, Jetty) | Embedded (built-in) |
| Dependencies | Manual version management | Starters with managed versions |
| Database | Manual DataSource config | Auto-configured from properties |
| Testing | Manual context setup | @SpringBootTest (auto-configured) |
| Deployment | WAR to external server | JAR with embedded server |
| Getting started | Hours | Minutes |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using field injection (@Autowired on fields) | Harder to test, hides dependencies | Use constructor injection |
| Putting business logic in @Configuration classes | Confusion — config vs service | Keep configuration separate from business logic |
| Disabling auto-configuration without understanding | Missing critical beans | Only exclude specific auto-configs you understand |
| Using @ComponentScan on a different base package | Misses beans or scans too much | Keep @ComponentScan in the root package |
| Not using profiles | Dev config leaks into production | Always use profile-specific properties |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [docs.spring.io/spring-boot/reference](https://docs.spring.io/spring-boot/reference/)
