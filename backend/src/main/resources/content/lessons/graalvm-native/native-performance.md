---
title: GraalVM Native Image — Java Without the JVM
summary: Ahead-of-time compilation, build-time reflection, native executables, and how organizations deploy Spring Boot apps as instant-startup containers. Beginner-friendly with line-by-line code.
order: 3
minutes: 20
topics: [GraalVM, native image, AOT compilation, build-time reflection, startup time, container deployment, Spring Native]
docs:
  - https://www.graalvm.org/latest/docs/getting-started/
  - https://docs.spring.io/spring-boot/reference/packaging/native-image/introducing-graalvm-native-images.html
---

# GraalVM Native Image — Java Without the JVM

## What is GraalVM Native Image? (From Zero)

Traditional Java runs on the JVM — you compile `.java` to `.class` to `.jar`, then the JVM interprets/JIT-compiles it at runtime. This gives you portability and great performance, but the JVM needs time to start up and uses significant memory.

**GraalVM Native Image** compiles your Java code **ahead of time (AOT)** into a standalone native executable — no JVM required. The result starts in milliseconds instead of seconds and uses a fraction of the memory.

### JVM vs Native Image

| Aspect | JVM (Traditional) | Native Image (GraalVM) |
|---|---|---|
| **Startup time** | 2-10 seconds | 10-50 milliseconds |
| **Memory usage** | 200-500 MB | 30-100 MB |
| **Binary size** | Depends on JRE install | 30-100 MB (includes everything) |
| **Peak throughput** | Higher (JIT optimizes over time) | Slightly lower (no runtime JIT) |
| **Build time** | Fast (seconds) | Slow (minutes) |
| **Reflection** | Full support | Limited (must declare at build time) |
| **Dynamic class loading** | Full support | Not supported |

**When to use native image:**
- Microservices that need fast startup (serverless, auto-scaling)
- CLI tools and developer utilities
- Container environments where memory is expensive
- Edge computing and IoT

**When NOT to use it:**
- Long-running services where peak throughput matters more than startup
- Applications that heavily use reflection, proxies, or dynamic class loading
- Development environments (JVM is faster to iterate with)

---

## The Code — Line by Line

### Setting Up Spring Boot with Native Image

```xml
<!-- pom.xml — Add the native image plugin -->
<build>
    <plugins>
        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
            <configuration>
                <imageName>academy</imageName>                    <!-- Output binary name -->
                <mainClass>com.example.academy.AcademyApplication</mainClass>
                <buildArgs>
                    <arg>--no-fallback</arg>                      <!-- Don't fall back to JVM -->
                    <arg>-H:+ReportExceptionStackTraces</arg>    <!-- Better error messages -->
                </buildArgs>
            </configuration>
        </plugin>
    </plugins>
</build>
```

### Building a Native Image

```bash
# Build the native executable:
./mvnw -Pnative native:compile

# Result: ./target/academy (Linux binary, ~60MB)
# Run it directly:
./target/academy

# Startup time: ~15ms (vs 3-5 seconds on JVM)
```

### Handling Reflection (The Big Challenge)


**What this code does — step by step:**

1. Native image needs to know about reflection at BUILD TIME, not runtime.
2. This works on JVM but FAILS on native image:
3. `User user = (User) objectMapper.readValue(json, User.class);` — Runtime reflection
4. SOLUTION 1: Register reflection configuration. In src/main/resources/META-INF/native-image/reflect-config.json:
5. SOLUTION 2: Use Spring's built-in AOT processing (preferred). Spring Boot's native support automatically registers reflection for: - @Entity classes. - @Configuration classes. - @Component classes. - @JsonProperty annotations. You don't need to manually configure reflection for Spring-managed beans

The same code, clean:

```java
User user = (User) objectMapper.readValue(json, User.class);

[
  {
    "name": "com.example.academy.model.User",
    "allDeclaredConstructors": true,
    "allPublicMethods": true,
    "allPublicFields": true
  }
]
```

### Custom Native Configuration


**What this code does — step by step:**

1. Register resources that should be included in the native image
2. `hints.resources().registerPattern("content/lessons/**");` — Include lesson files
3. `hints.resources().registerPattern("templates/**");` — Include templates
4. `hints.resources().registerPattern("static/**");` — Include static assets
5. Register reflection for classes not managed by Spring
6. Register proxy interfaces

The same code, clean:

```java
@Configuration
@ImportRuntimeHints(CustomRuntimeHints.class)
public class NativeConfig {

    @Bean
    RuntimeHints runtimeHints() {
        RuntimeHints hints = new RuntimeHints();

        hints.resources().registerPattern("content/lessons/**");
        hints.resources().registerPattern("templates/**");
        hints.resources().registerPattern("static/**");

        hints.reflection().registerType(ExternalApiClient.class,
            MemberInferenceCategory.ALL_DECLARED_CONSTRUCTORS);

        hints.proxies().registerJdkProxy(OrderService.class);

        return hints;
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Serverless (AWS Lambda)

// With JVM: cold start = 3-5 seconds (unacceptable for API gateway)
// With native image: cold start = 50ms (imperceptible to users)

@LambdaProxy(apiGateway = true)
public class OrderHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    @Autowired
    private OrderService orderService;

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        Order order = orderService.findById(input.getPathParameters().get("id"));
        return new APIGatewayProxyResponseEvent()
            .withStatusCode(200)
            .withBody(objectMapper.writeValueAsString(order));
    }
}

### Scenario 2: Fast Auto-Scaling


**What this code does — step by step:**

1. Kubernetes HPA (Horizontal Pod Autoscaler) scales based on CPU/memory. Native image: starts in 50ms → new pod serves traffic almost immediately. JVM: starts in 5 seconds → traffic backs up while waiting
2. In k8s deployment: spec: containers: - name: academy. Image: academy-native:latest # GraalVM native image. Resources: limits: memory: "128Mi" # Only needs 128MB (vs 512MB for JVM). Cpu: "200m" # Low CPU (starts so fast, no burst needed)

The same code, clean:

```java
```

### Scenario 3: CLI Tool

@SpringBootApplication
public class AcademyCli implements CommandLineRunner {

    @Autowired
    private ContentService contentService;

    @Override
    public void run(String... args) {
        // Native image: starts instantly, runs, exits
        // JVM: 3-5 second startup for a simple CLI tool
        contentService.validateAllLessons();
        System.out.println("All lessons validated successfully.");
    }
}

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Using `Class.forName()` dynamically | Native image can't resolve at build time | Use `@RegisterReflection` or Spring AOT |
| Forgetting resource registration | Properties/config files not found | Register with `RuntimeHints` or `reflect-config.json` |
| Using `java.lang.reflect.Proxy` heavily | Dynamic proxies need build-time registration | Use `hints.proxies().registerJdkProxy()` |
| Expecting JIT performance | Native image has no JIT — peak throughput is lower | Profile before switching; native is for startup, not throughput |
| Building native image in CI without GraalVM | Build fails with "native-image not found" | Install GraalVM or use Docker with GraalVM base image |

---

## Key Takeaways

- **Native image = instant startup** (50ms vs 5s) and **low memory** (128MB vs 512MB).
- **The trade-off**: slower build time, limited reflection, slightly lower peak throughput.
- **Spring Boot has native support** — most Spring annotations work automatically with AOT processing.
- **Resource registration** is needed for files accessed by path (not by Spring).
- **Best for**: serverless, auto-scaling microservices, CLI tools, container environments.

Official docs: [GraalVM](https://www.graalvm.org/latest/docs/getting-started/) · [Spring Boot Native](https://docs.spring.io/spring-boot/reference/packaging/native-image/introducing-graalvm-native-images.html)

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [graalvm.org/latest/docs](https://www.graalvm.org/latest/docs/)
