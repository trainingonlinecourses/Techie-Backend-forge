---
title: What is Spring Boot — Why It Exists, How It Differs from Spring, and Auto-Configuration
summary: Plain Spring's configuration pain, what Spring Boot solves (embedded servers, auto-configuration, starters, opinionated defaults), how @SpringBootApplication works under the hood, and why every production Java team uses it with line-by-line walkthroughs.
order: 1
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

```java
// BEFORE Spring Boot (traditional Spring):
// 1. web.xml — 50 lines of XML to configure a servlet
// 2. applicationContext.xml — 100 lines to configure beans
// 3. pom.xml — 30 dependencies with exact versions
// 4. Deploy WAR to Tomcat manually
// Total: ~3 hours to get a "Hello World" running

// AFTER Spring Boot:
@SpringBootApplication    // one annotation does everything
public class MyApp {
    public static void main(String[] args) {
        SpringApplication.run(MyApp.class, args);  // runs the app with embedded Tomcat
    }
}

@RestController
public class HelloController {
    @GetMapping("/hello")
    public String hello() {
        return "Hello, World!";
    }
}
// Run: mvn spring-boot:run
// Total: 5 minutes to get "Hello World" running
```

## What @SpringBootApplication actually does

```java
@SpringBootApplication  // THIS IS THE MAGIC ANNOTATION
// It's actually THREE annotations combined:

@SpringBootConfiguration   // marks this class as a configuration class (like @Configuration)
@EnableAutoConfiguration   // tells Spring Boot to automatically configure beans
@ComponentScan             // scans this package and sub-packages for @Component, @Service, etc.

// Equivalent to:
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(basePackages = "com.backendforge.academy")
public class AcademyApplication { ... }
```

### How auto-configuration works

```java
// Spring Boot ships with "auto-configuration classes" — one for each technology:
// DataSourceAutoConfiguration — configures database connection if H2/PostgreSQL is on classpath
// JacksonAutoConfiguration — configures JSON serialization if Jackson is on classpath
// SecurityAutoConfiguration — configures security if Spring Security is on classpath

// Example: DataSourceAutoConfiguration
@AutoConfiguration
@ConditionalOnClass(DataSource.class)              // ONLY load if DataSource class exists
@ConditionalOnProperty(name = "spring.datasource.url")  // ONLY if datasource URL is configured
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean                      // ONLY create if you haven't defined your own
    public DataSource dataSource(DataSourceProperties properties) {
        return DataSourceBuilder.create()
            .url(properties.getUrl())              // reads from application.properties
            .username(properties.getUsername())
            .password(properties.getPassword())
            .build();
    }
}

// YOU don't configure the DataSource — Spring Boot does it automatically!
// Just add postgresql to your pom.xml and set spring.datasource.url in properties
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

```java
// Traditional Spring: deploy WAR to external Tomcat
// mvn package → creates app.war → copy to Tomcat/webapps → restart Tomcat

// Spring Boot: embedded Tomcat — runs inside your app
// mvn package → creates app.jar → java -jar app.jar → done!

// Spring Boot includes embedded Tomcat, Jetty, or Undertow:
// pom.xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>  // includes embedded Tomcat
</dependency>

// To use Jetty instead of Tomcat:
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

```java
// Instead of adding 10 separate dependencies:
// spring-core, spring-web, spring-mvc, jackson-databind, tomcat-embed, ...

// Spring Boot provides "starters" — bundles of related dependencies:
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>   // adds Spring MVC + Jackson + Tomcat
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>  // adds Spring Data JPA + Hibernate
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>  // adds Spring Security
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>  // adds JUnit 5 + Mockito + AssertJ
</dependency>
```

## How we use it in organizations

### Scenario 1: Creating a new microservice in minutes

```java
// Step 1: Go to start.spring.io, select: Web, Data JPA, PostgreSQL, Security
// Step 2: Download, unzip, open in IDE
// Step 3: Write your first endpoint

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {  // constructor injection
        this.userService = userService;
    }

    @GetMapping
    public List<UserResponse> getAllUsers() {
        return userService.findAll();  // returns list of users as JSON
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return userService.findById(id);  // returns single user as JSON
    }

    @PostMapping
    public ResponseEntity<UserResponse> createUser(@RequestBody @Valid CreateUserRequest req) {
        UserResponse created = userService.create(req);
        return ResponseEntity.status(201).body(created);  // 201 Created
    }
}

// application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/userdb
    username: postgres
    password: secret
  jpa:
    hibernate:
      ddl-auto: validate  # validate schema in production

// That's it. You now have a full REST API with:
// ✅ JSON serialization (Jackson)
// ✅ Database access (JPA + Hibernate)
// ✅ Validation (@Valid)
// ✅ Security (Spring Security — add @EnableWebSecurity)
// ✅ Embedded Tomcat
// ✅ Health checks (/actuator/health)
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

```java
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
```

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
