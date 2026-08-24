---
title: Spring Boot Embedded Servlet Containers — Tomcat, Jetty and Undertow
summary: Embedded server architecture, switching between Tomcat and Jetty, customizing connectors, SSL/TLS configuration, connection pooling, graceful shutdown hooks, and production hardening of the embedded container.
order: 40
minutes: 20
topics: [embedded-server, tomcat, jetty, undertow, ssl, connector, connection-pool, container-customization]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.server
---

# Spring Boot Embedded Servlet Containers — Tomcat, Jetty and Undertow

## The concept

Spring Boot embeds a web server (Tomcat by default) directly inside your application JAR. When you run `java -jar app.jar`, the server starts inside the same JVM process. No external servlet container (like a standalone Tomcat installation) is needed.

**Why embedded servers?**
- **Simplicity** — One command to start the entire application
- **Portability** — No dependency on an installed container
- **Version control** — Container version is in your build file, not on the server
- **Customization** — Full programmatic control over the container

**Which server to choose?**

| Server | Performance | Memory | Features | Default in Spring Boot |
|---|---|---|---|---|
| **Tomcat** | Good | Medium | Full Servlet spec, mature | Yes |
| **Jetty** | Good | Low | WebSocket support, Eclipse-based | No |
| **Undertow** | Excellent | Low | Non-blocking, best for high concurrency | No |

## How we use it in organizations

### Scenario 1: Switching to Jetty

```xml
<!-- pom.xml -->
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

### Scenario 2: Customizing Tomcat

```java
@Bean
public TomcatServletWebServerFactory tomcatFactory() {
    return new TomcatServletWebServerFactory() {
        @Override
        protected void postProcessContext(Context context) {
            // Enable access logging
            AccessLogValve accessLog = new AccessLogValve();
            accessLog.setDirectory("logs");
            accessLog.setPattern("%h %t \"%r\" %s %b");
            accessLog.setSuffix(".log");
            context.getPipeline().addValve(accessLog);
        }
    };
}

@Bean
public WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
    return factory -> {
        factory.addConnectorCustomizers(connector -> {
            connector.setMaxPostSize(10 * 1024 * 1024);  // 10MB
            connector.setMaxSwallowSize(-1);              // unlimited
        });
        factory.addContextCustomizers(context -> {
            context.setAllowCasualMultipartParsing(true);
        });
    };
}
```

### Scenario 3: SSL/TLS configuration

```yaml
# application.yml
server:
  port: 8443
  ssl:
    key-store: classpath:keystore.p12
    key-store-password: ${KEYSTORE_PASSWORD}
    key-store-type: PKCS12
    key-alias: tomcat
    protocol: TLS
    enabled-protocols: TLSv1.2,TLSv1.3
```

```java
// Force HTTP → HTTPS redirect
@Bean
public ServletWebServerFactory servletContainer() {
    TomcatServletWebServerFactory tomcat = new TomcatServletWebServerFactory() {
        @Override
        protected void postProcessContext(Context context) {
            SecurityConstraint constraint = new SecurityConstraint();
            constraint.setUserConstraint("CONFIDENTIAL");
            SecurityCollection collection = new SecurityCollection();
            collection.addPattern("/*");
            constraint.addCollection(collection);
            context.addConstraint(constraint);
        }
    };
    tomcat.addAdditionalTomcatConnectors(httpRedirectConnector());
    return tomcat;
}

private Connector httpRedirectConnector() {
    Connector connector = new Connector("org.apache.coyote.http11.Http11NioProtocol");
    connector.setScheme("http");
    connector.setPort(8080);
    connector.setSecure(false);
    connector.setRedirectPort(8443);
    return connector;
}
```

### Scenario 4: Connection pool tuning

```yaml
server:
  tomcat:
    threads:
      max: 200          # max worker threads
      min-spare: 10     # keep at least 10 threads ready
    max-connections: 10000
    accept-count: 100   # queue size when all threads busy
    connection-timeout: 20000  # 20 seconds
```

```java
// Programmatic tuning
@Bean
public WebServerFactoryCustomizer<TomcatServletWebServerFactory> connectionPoolCustomizer() {
    return factory -> factory.addConnectorCustomizers(connector -> {
        protocol = (Http11NioProtocol) connector.getProtocolHandler();
        protocol.setMaxThreads(200);
        protocol.setMinSpareThreads(10);
        protocol.setMaxConnections(10000);
        protocol.setAcceptCount(100);
        protocol.setConnectionTimeout(20000);
    });
}
```

### Scenario 5: Graceful shutdown

When deploying new versions, you need to drain in-flight requests before stopping:

```yaml
server:
  shutdown: graceful  # enable graceful shutdown

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s  # max wait for in-flight requests
```

```java
// Add a shutdown hook to log and clean up
@Component
public class ShutdownHook {
    private final ApplicationContext context;

    @EventListener
    public void onShutdown(ContextClosedEvent event) {
        log.info("Application shutting down — completing in-flight requests");
        // The server stops accepting new requests immediately
        // but waits up to 30s for existing requests to finish
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Too few threads | Request queuing, timeouts under load |
| Too many threads | Context switching overhead, memory exhaustion |
| No connection timeout | Slow clients hold threads forever |
| Not configuring SSL protocols | Vulnerable to protocol downgrade attacks |
| Ignoring graceful shutdown | In-flight requests dropped on redeploy |
| Using default maxPostSize for file uploads | Upload failures over 2MB |
| Not setting accept-count | 503 errors during traffic spikes |
