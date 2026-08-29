---
title: Spring Boot Admin — Monitoring and Managing Your Application
summary: Spring Boot Admin Server setup, client registration, Actuator endpoints exposure, logging level management, notification channels, and how organizations monitor application health without expensive APM tools.
order: 41
minutes: 18
topics: [spring-boot-admin, actuator, monitoring, health-check, log-level, notification, micrometer, metrics]
docs:
  - https://codecentric.github.io/spring-boot-admin/
  - https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html
---

# Spring Boot Admin — Monitoring and Managing Your Application

## The concept

Spring Boot Admin (SBA) is a web UI for monitoring and managing Spring Boot applications. It connects to your app's Actuator endpoints and provides a dashboard for health, metrics, environment, logs, and more.

**Why it matters:** in production, you need visibility without SSH-ing into servers. SBA gives you a central dashboard showing health status, log levels, environment variables, JVM metrics, and thread dumps — all without leaving your browser.

## Setup: Admin Server

```xml
<dependency>
    <groupId>de.codecentric</groupId>
    <artifactId>spring-boot-admin-starter-server</artifactId>
    <version>3.3.5</version>
</dependency>
```

```java
@SpringBootApplication
@EnableAdminServer
public class AdminServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(AdminServerApplication.class, args);
    }
}
```

## Setup: Client Application

```xml
<dependency>
    <groupId>de.codecentric</groupId>
    <artifactId>spring-boot-admin-starter-client</artifactId>
    <version>3.3.5</version>
</dependency>
```

```yaml
# Client application.yml
spring:
  boot:
    admin:
      client:
        url: http://admin-server:9090
        username: admin
        password: secret
        instance:
          prefer-ip: true  # useful in Kubernetes

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,env,loggers,threaddump,mappings
  endpoint:
    health:
      show-details: always
```

## Actuator endpoints exposed via SBA

| Endpoint | Purpose |
|---|---|
| `/health` | Application health status |
| `/info` | Application info (git commit, version) |
| `/metrics` | JVM, HTTP, database metrics |
| `/env` | Environment variables and properties |
| `/loggers` | View and change log levels at runtime |
| `/threaddump` | Thread dump |
| `/mappings` | All request mappings |
| `/beans` | All Spring beans |
| `/conditions` | Auto-configuration conditions |

## Runtime log level management

SBA lets you change log levels without redeploying:

```java
// Via SBA UI or API:
// POST /api/instances/{id}/actuator/loggers/com.backendforge
// {"configuredLevel": "DEBUG"}

// Via API:
curl -X POST http://admin:9090/api/instances/my-app/actuator/loggers/com.backendforge \
  -H "Content-Type: application/json" \
  -u admin:secret \
  -d '{"configuredLevel": "DEBUG"}'
```

Temporarily enabling DEBUG in production for a specific package — no restart, no config change.

## Notification channels

```yaml
spring:
  boot:
    admin:
      notify:
        mail:
          enabled: true
          to: ops@backendforge.com
          from: alert@backendforge.com
          subject: "[SBA] {application} is {status}"
        slack:
          enabled: true
          webhook-url: https://hooks.slack.com/services/xxx
          channel: "#ops-alerts"
        pagerduty:
          enabled: true
          service-key: ${PAGERDUTY_KEY}
```

## Custom health indicators

```java
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    private final WebClient webClient;

    @Override
    public Health health() {
        try {
            webClient.get().uri("https://api.payment.com/health")
                .retrieve().bodyToMono(String.class)
                .timeout(Duration.ofSeconds(3))
                .block();
            return Health.up().withDetail("payment-api", "reachable").build();
        } catch (Exception e) {
            return Health.down().withDetail("payment-api", e.getMessage()).build();
        }
    }
}
```

## How we use it in organizations

### Scenario 1: centralized monitoring for microservices

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin-server
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: admin
          image: backendforge/admin:latest
          ports:
            - containerPort: 9090
```

Each microservice registers with SBA. The ops team has one dashboard for all services.

### Scenario 2: database connection pool monitoring

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,metrics
  metrics:
    export:
      prometheus:
        enabled: true
```

SBA displays connection pool metrics: active connections, idle connections, pending threads. Alert when pool is exhausted.

### Scenario 3: JVM monitoring without external tools

SBA shows real-time JVM metrics: heap usage, GC frequency, thread count, CPU load. This replaces `jstat` for most use cases.

## Security

```java
@Configuration
public class AdminSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login").permitAll()
                .requestMatchers("/assets/**").permitAll()
                .anyRequest().authenticated())
            .formLogin(form -> form.loginPage("/login"))
            .httpBasic(Customizer.withDefaults());

        return http.build();
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Exposing Actuator in production without auth | Anyone can change log levels, view env |
| SBA server not behind VPN | Management dashboard publicly accessible |
| No custom health indicators | Only shows Spring's built-in health |
| Too many endpoints exposed | Performance overhead, security surface |
| No notification configuration | Ops not alerted when app goes down |
