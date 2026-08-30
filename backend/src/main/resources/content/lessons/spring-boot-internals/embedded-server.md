---
title: The Embedded Server — Tomcat Inside Your App
module: spring-boot-internals
order: 3
minutes: 23
topics: ["embedded Tomcat", "executable jar", "server configuration", "context path", "ports"]
summary: In the classic Spring era, deploying meant: install Tomcat on a server, drop your app's WAR file into Tomcat's webapps folder, and hope the Tomcat ...
docs:
  - title: "Embedded web servers (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/howto/webserver.html"
---

# The Embedded Server — Tomcat Inside Your App

## The Concept: No More External Server Installation

In the classic Spring era, deploying meant: install Tomcat on a server, drop your app's **WAR** file into Tomcat's `webapps` folder, and hope the Tomcat version matched your app's expectations. Two separate lifecycles, two separate upgrade paths, config split between server and app.

**Spring Boot flips this**: the web server (Tomcat by default, but also Jetty or Undertow) is a **library inside your application**. Your `main` method starts the whole thing — server included:

```java
@SpringBootApplication
public class AcademyApplication {
    public static void main(String[] args) {
        SpringApplication.run(AcademyApplication.class, args);   // starts Tomcat too
    }
}
```

When this runs, Spring Boot:

1. Bootstraps the application context.
2. Discovers `spring-boot-starter-web` on the classpath (hence Tomcat).
3. Creates and configures an embedded Tomcat instance.
4. Registers your `DispatcherServlet` (the front controller that routes to your `@Controller`s).
5. Binds to a port and starts accepting HTTP.

The app *is* the server. There's no separate deployment step — `java -jar app.jar` runs everything.

## The Executable Jar — Why "java -jar" Works

A normal jar can't run an app with dependencies — the dependencies live in separate jars. Boot's `spring-boot-maven-plugin` builds an **executable (fat) jar** that nests the dependencies inside (`BOOT-INF/lib`) and uses a custom classloader to load them.

```bash
mvn package
java -jar target/app.jar
```

One file, everything inside, runs anywhere with a JRE. This is what makes deployment to Render/Railway/Docker trivial: the container image just needs a JRE and the jar — no application server installation.

## The Code Walkthrough — Configuring the Server

```java
// application.properties — the server is just properties now
server.port=8080                 # which port to bind (0 = random free port)
server.address=0.0.0.0           # bind to all interfaces (for containers)
server.servlet.context-path=/api # all URLs prefixed with /api
server.tomcat.threads.max=200    # max worker threads
server.tomcat.threads.min-spare=10
server.tomcat.max-connections=10000
server.shutdown=graceful         # wait for in-flight requests on shutdown
server.tomcat.connection-timeout=20s
```

```java
// Or programmatically, if you need logic at startup:
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class ServerConfig {

    @Bean
    WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> serverCustomizer() {
        return factory -> {
            factory.setPort(9090);
            factory.setContextPath("/api");
        };
    }
}
```

### Walking Through Each Part

**`server.port`** — the port. `0` tells Boot to pick a free random port (useful in tests). In production you usually override it via an environment variable: `SERVER_PORT=8081 java -jar app.jar` — every `server.*` property maps to an env var (`SERVER_PORT`, `SERVER_SERVLET_CONTEXT_PATH`, ...), which is how containers pass config.

**`server.servlet.context-path=/api`** — every route gets the prefix: a controller mapped to `/health` now answers at `/api/health`. This is the standard way to namespace an API behind a gateway.

**Thread settings** — `server.tomcat.threads.max` caps the worker threads (each handles one request at a time). Too low = requests queue; too high = memory pressure. For a free-tier backend, the default (200) is usually fine.

**`server.shutdown=graceful`** — on shutdown, Tomcat stops *accepting new* connections but finishes **in-flight** requests. Combined with `SpringApplication.setRegisterShutdownHook`, this gives clean deploys without dropped requests.

**The programmatic customizer** — for logic-based configuration, a `WebServerFactoryCustomizer` bean tweaks the factory before the server starts. Prefer properties where possible; use the customizer for conditional logic.

## Changing the Server (Tomcat → Jetty → Undertow → Netty)

```xml
<!-- Replace starter-web's Tomcat with Jetty: -->
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

Same application code, different server — the servlet API (`jakarta.servlet`) is the abstraction. This is the payoff of the embedded model: swapping servers is a dependency change, not a deployment overhaul.

## HTTPS and Production Concerns

- **Terminate TLS at the proxy/gateway** — for free-tier deployments (Render, Railway), the platform handles HTTPS in front; your app serves plain HTTP on the internal port.
- **`server.forward-headers-strategy=framework`** — tells Boot to trust `X-Forwarded-*` headers from the proxy so redirects and generated URLs use HTTPS. Set this behind any reverse proxy.
- **Don't run the embedded server as root / on port 80** — containers expose an internal port (e.g., 8080); the platform maps it.

## Common Beginner Pitfalls

1. **Two servers** — running `starter-web` AND `starter-webflux` can start conflicting servers; pick one stack.
2. **Port already in use** — `Port 8080 was already in use`; change `server.port` or kill the process.
3. **Behind a proxy without `forward-headers-strategy`** — redirects and links generated with `http://` instead of `https://`; set the property.
4. **Context path surprises** — after setting `/api`, all your client URLs need the prefix; update the frontend base URL too.
5. **Forgetting `server.address=0.0.0.0` in containers** — the default binds to all interfaces, but if you set it to `localhost`, the container's port mapping finds nothing. In containers, bind `0.0.0.0`.
6. **Changing port in tests** — use `server.port=0` (random) or `@SpringBootTest(webEnvironment = RANDOM_PORT)` so tests don't collide.

## Key Takeaways

- The web server is a library inside your app — `main` starts everything.
- The executable jar (`java -jar`) contains the app + server + dependencies.
- Server behavior is properties: `server.port`, `server.servlet.context-path`, thread limits, graceful shutdown.
- Every property maps to an env var — containers configure the server externally.
- Swap Tomcat for Jetty/Undertow by changing the starter dependency.
- Set `forward-headers-strategy=framework` behind a proxy that terminates TLS.
