---
title: Circuit Breaker — Preventing Cascade Failures
summary: Resilience4j circuit breaker in depth, state transitions, fallback strategies, monitoring, and why microservices need circuit breakers.
order: 11
minutes: 20
topics: [circuit-breaker, resilience4j, fault-tolerance, fallback, cascade-failure, microservices-resilience]
docs:
  - https://resilience4j.readme.io/docs/circuitbreaker
  - https://docs.spring.io/spring-cloud-circuitbreaker/docs/current/reference/html/
---

# Circuit Breaker — Preventing Cascade Failures

## What Is a Circuit Breaker?

A **Circuit Breaker** protects your system from **cascade failures** when a downstream service is down.

**Think of it like**: an electrical circuit breaker in your house. If there's a fault, the breaker trips (opens) to prevent fire. You fix the fault, then reset the breaker.

### The Problem: Cascade Failure

```
Service A calls Service B (slow/down)
  → Service A's threads wait for Service B
    → Service A runs out of threads
      → Service A can't serve its own clients
        → Service A's clients timeout and retry
          → More load on Service A → complete failure
```

### The Solution: Circuit Breaker

```
Service A calls Service B (slow/down)
  → Circuit Breaker detects failures
    → Circuit OPENS (stops calling Service B)
      → Service A returns FALLBACK response
        → Service A's threads stay free
          → Service A can serve its own clients
            → When Service B recovers, circuit CLOSES
```

---

## Circuit Breaker States

```
CLOSED ──(failures exceed threshold)──→ OPEN
  ↑                                      │
  │                              (timeout expires)
  │                                      ↓
  └──────── (probe succeeds) ←──── HALF-OPEN
```

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, requests go through, failures are counted |
| **OPEN** | Requests immediately fail without calling the service |
| **HALF-OPEN** | One probe request goes through to test if service recovered |

---

## Resilience4j Circuit Breaker Setup

### Dependencies

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
```

### Configuration

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      userService:
        slidingWindowSize: 10           # Count last 10 calls
        failureRateThreshold: 50        # Open if 50%+ fail
        waitDurationInOpenState: 30s    # Wait 30s before probing
        permittedNumberOfCallsInHalfOpenState: 3  # Allow 3 probe calls
        minimumNumberOfCalls: 5          # Need at least 5 calls to evaluate
        automaticTransitionFromOpenToHalfOpenEnabled: true
```

### Usage with @CircuitBreaker

```java
@Service
public class OrderService {

    private final UserServiceClient userClient;

    @CircuitBreaker(name = "userService", fallbackMethod = "getUserFallback")
    public User getUser(String userId) {
        return userClient.getUser(userId);  // May fail if UserService is down
    }

    // Fallback method — called when circuit is OPEN
    public User getUserFallback(String userId, Exception e) {
        log.warn("UserService unavailable, using fallback for user: {}", userId);
        // Return cached user or default
        return cachedUserService.getCachedUser(userId)
            .orElse(new User(userId, "Unknown User", "unknown@example.com"));
    }
}
```

### Retry + Circuit Breaker

```java
@CircuitBreaker(name = "userService", fallbackMethod = "getUserFallback")
@Retry(name = "userService")  // Retry before circuit breaker trips
public User getUser(String userId) {
    return userClient.getUser(userId);
}
```

---

## Monitoring Circuit Breaker

```java
@Component
public class CircuitBreakerMetrics {

    private final MeterRegistry registry;

    public CircuitBreakerMetrics(CircuitBreakerRegistry registry) {
        // Publish metrics for each circuit breaker
        registry.getEventPublisher()
            .onEvent(event -> {
                log.info("Circuit Breaker Event: {} - State: {}",
                    event.getCircuitBreakerName(),
                    event.getEventType());
            });

        // Register health indicator
        registry.getAllCircuitBreakers().forEach(cb -> {
            Gauge.builder("resilience4j.circuitbreaker.state", cb,
                bcb -> bcb.getState().ordinal())
                .tag("name", cb.getName())
                .register(registry);
        });
    }
}
```

---

## In an Organization

### Scenario 1: Payment Gateway Circuit Breaker

```java
@Service
public class PaymentService {

    private final PaymentGatewayClient gatewayClient;
    private final PaymentRepository paymentRepo;

    @CircuitBreaker(name = "paymentGateway", fallbackMethod = "paymentFallback")
    @Retry(name = "paymentGateway")
    public PaymentResult processPayment(PaymentRequest request) {
        return gatewayClient.charge(request);
    }

    public PaymentResult paymentFallback(PaymentRequest request, Exception e) {
        log.error("Payment gateway unavailable: {}", e.getMessage());

        // Queue for later processing
        PaymentQueueEntry entry = new PaymentQueueEntry(request, LocalDateTime.now());
        paymentQueueRepository.save(entry);

        return PaymentResult.queued(
            "Payment queued for processing. Gateway temporarily unavailable.");
    }
}
```

### Scenario 2: User Profile with Cache Fallback

```java
@Service
public class UserProfileService {

    private final UserServiceClient userClient;
    private final RedisTemplate<String, User> redisTemplate;

    @CircuitBreaker(name = "userService", fallbackMethod = "cachedProfileFallback")
    public UserProfile getProfile(String userId) {
        User user = userClient.getUser(userId);
        ProfileData profile = profileClient.getProfile(userId);

        // Cache for fallback
        redisTemplate.opsForValue().set("user:" + userId, user, Duration.ofMinutes(5));

        return new UserProfile(user, profile);
    }

    public UserProfile cachedProfileFallback(String userId, Exception e) {
        User cachedUser = redisTemplate.opsForValue().get("user:" + userId);
        if (cachedUser != null) {
            return new UserProfile(cachedUser, ProfileData.partial());
        }
        return UserProfile.unknown(userId);
    }
}
```

### Scenario 3: Multi-Service Aggregation with Fallbacks

```java
@Service
public class DashboardAggregator {

    @CircuitBreaker(name = "orderService", fallbackMethod = "ordersFallback")
    public List<OrderSummary> getOrders(String userId) {
        return orderClient.getOrders(userId);
    }

    @CircuitBreaker(name = "recommendationService", fallbackMethod = "recommendationsFallback")
    public List<Product> getRecommendations(String userId) {
        return recommendationClient.getRecommendations(userId);
    }

    @CircuitBreaker(name = "notificationService", fallbackMethod = "notificationsFallback")
    public List<Notification> getNotifications(String userId) {
        return notificationClient.getNotifications(userId);
    }

    // Each service has its own independent fallback
    public List<OrderSummary> ordersFallback(String userId, Exception e) {
        return List.of();  // Empty list — dashboard still loads
    }

    public List<Product> recommendationsFallback(String userId, Exception e) {
        return defaultRecommendations();  // Show generic recommendations
    }

    public List<Notification> notificationsFallback(String userId, Exception e) {
        return List.of();  // Skip notifications — not critical
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No fallback defined | Exception propagates to caller | Always provide a fallback method |
| Fallback throws exception | Circuit breaker useless | Fallback must always succeed |
| Same circuit breaker for all services | One failure affects all | Use separate circuit breaker per service |
| Not monitoring circuit state | Can't detect issues | Export metrics to Prometheus/Grafana |
| Threshold too sensitive | Unnecessary circuit opens | Set reasonable `minimumNumberOfCalls` |
| Threshold too loose | Cascade failure not prevented | Set appropriate `failureRateThreshold` |
