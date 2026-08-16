---
title: Service Discovery with Eureka
summary: The registry pattern, running a Eureka server, registering clients, heartbeats and load balancing with lb://.
order: 2
minutes: 20
topics: [eureka, service-discovery, loadbalancer, registry]
docs:
  - https://docs.spring.io/spring-cloud-netflix/reference/
  - https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons.html
---

# Service Discovery with Eureka

## The problem

In a monolith, services are in one process — no "where is it?" question. Split the process and every client needs an address. You could hardcode URLs… until you scale to 3 instances, redeploy on a new IP, or a service dies.

**Discovery** solves it: every instance *registers itself* with a registry and *heartbeats* to say "I'm alive". Clients ask the registry "where is ORDER-SERVICE?" and get the live instances, then load-balance across them.

```
order-service ──register + heartbeat──▶ Eureka (:8761)
inventory-service ──register + heartbeat──▶ Eureka
gateway ── GET http://ORDER-SERVICE/api/... ──▶ resolved via registry + load balancer
```

## 1. The Eureka server (one dependency, two annotations)

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```

```yaml
# eureka-server/application.yml
server:
  port: 8761

eureka:
  client:
    register-with-eureka: false     # the server doesn't register with itself
    fetch-registry: false
  server:
    wait-time-in-ms-when-sync-empty: 0   # faster local startup
```

Open http://localhost:8761 — the Eureka dashboard lists every registered instance, its status, and recent heartbeats. That dashboard is the first thing you show when someone asks "which services are running?"

## 2. Registering a client

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

```yaml
spring:
  application:
    name: order-service          # ← this name is the service id (must be unique, lowercase)
eureka:
  client:
    serviceUrl:
      defaultZone: http://localhost:8761/eureka
  instance:
    prefer-ip-address: true      # register by IP in most environments
```

That's it — the client registers on startup and sends heartbeats (~30s by default). The app name becomes the **logical address** every other service uses.

## 3. Calling a service by name: lb:// + load balancing

With the registry in place, clients don't use IPs — they use the **logical name**:

```java
@FeignClient(name = "inventory-service")          // declarative HTTP client
public interface InventoryClient {
    @GetMapping("/api/inventory/{sku}")
    InventoryStock getStock(@PathVariable("sku") String sku);
}
```

```yaml
# Feign + LoadBalancer resolve "inventory-service" through Eureka
# and round-robin across all its instances:
```

For plain HTTP clients:

```java
@Bean
RestClient restClient(RestClient.Builder builder, LoadBalancerClient lb) {
    return builder.build();
}
// http://inventory-service/api/inventory/{sku} — resolved via the registry
```

Or with a WebClient: `webClientBuilder.baseUrl("http://inventory-service")`. The `lb://` scheme is the same idea in Gateway routes (`uri: lb://ORDER-SERVICE`).

**What happens when instances scale?** 3 instances of inventory-service → 3 registrations → the load balancer spreads calls across them. No config change, no redeploy of callers.

## 4. Failure handling

- **Heartbeats** — an instance that stops heartbeating (30s default) is evicted from the registry (90s). Clients stop routing to it.
- **Self-preservation mode** — if Eureka stops receiving heartbeats en masse (network partition), it *stops evicting* to protect live instances. You'll see a scary red warning on the dashboard — usually fine in prod, worth knowing it exists.
- **Stale instances** — a crashed instance lingers up to the eviction interval; clients may hit it once and get a connection error → that's exactly why resilience (circuit breakers/retries) matters (see the resilience lesson).

## Registration config that matters in production

```yaml
eureka:
  instance:
    prefer-ip-address: true
    lease-renewal-interval-in-seconds: 30     # how often to heartbeat
    lease-expiration-duration-in-seconds: 90  # when to evict
  client:
    healthcheck:
      enabled: true           # register /actuator/health state with Eureka
```

Set `healthcheck.enabled` so Eureka marks an instance *down* (not just absent) when your app's health fails — otherwise the registry keeps routing to a sick instance.

> **Why it matters (organizational view)** — Discovery replaces the "shared spreadsheet of service URLs" with a live registry. The dashboard is ops' ground truth; the service id (`spring.application.name`) becomes the stable contract between teams — callers reference names, never IPs, so teams redeploy and scale freely. Org rules: unique lowercase service ids, healthcheck-based registration, and callers depend on names via Feign/`lb://`, never hardcoded URLs.

## Key takeaways

- Eureka = registry + heartbeats; server needs `@EnableEurekaServer`, clients just a starter.
- `spring.application.name` is the logical address everyone uses.
- Call by name: `@FeignClient(name=...)`, `lb://SERVICE` in gateway routes.
- Enable healthcheck-based registration; eviction + circuit breakers handle deaths.

**Official docs:** [Spring Cloud Netflix](https://docs.spring.io/spring-cloud-netflix/reference/) · [LoadBalancer](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons.html)
