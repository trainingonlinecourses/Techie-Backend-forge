---
title: Redis-Backed Sessions — Shared State at Scale
summary: Configuring Redis as the Spring Session backend with connection pooling, serialization strategies, TTL management, and Redis Cluster support for high-traffic applications.
order: 2
minutes: 25
topics: ["redis session", "connection pooling", "jackson serializer", "session ttl", "redis cluster"]
docs:
  - url: "https://spring.io/projects/spring-session-data-redis"
    title: "Spring Session Data Redis"
---

## The Concept, From Zero

Redis is the most popular session store because it's **fast** (~1ms reads), **supports TTL** (automatic expiry), and **runs in-memory** (millions of operations per second). When you configure Spring Session with Redis, every session attribute gets serialized and stored as a Redis key.

**How a session looks in Redis:**
```
Key:   spring:session:sessions:abc-123-def
Value: (serialized session data — attributes, creation time, etc.)
TTL:   1800 seconds (30 minutes)
```

**When organizations use this:**
- E-commerce during Black Friday: 50,000 concurrent sessions, each surviving across 20 app instances
- Banking: Sessions persist through rolling deployments without user disruption
- Social media: Session data shared between web and mobile API servers

---

## Complete Configuration

```java
package com.example.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisHttpSession;

import java.time.Duration;

@Configuration
@EnableRedisHttpSession(
    maxInactiveIntervalInSeconds = 1800,  // 30 minutes
    redisNamespace = "myapp",             // Key prefix
    flushMode = FlushMode.ON_SAVE        // When to persist
)
public class SessionConfig {

    /**
     * Create a Redis connection with pooling and timeouts.
     * 
     * Line-by-line:
     * - RedisStandaloneConfiguration: points to a single Redis server
     *   (use RedisClusterConfiguration for clusters)
     * - LettuceClientConfiguration: configures the connection pool
     * - commandTimeout: how long to wait for a Redis command
     * - connectTimeout: how long to wait for initial connection
     * - usePooling: reuse connections instead of creating new ones
     */
    @Bean
    public LettuceConnectionFactory connectionFactory() {
        RedisStandaloneConfiguration config =
            new RedisStandaloneConfiguration("localhost", 6379);

        LettuceClientConfiguration clientConfig =
            LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofSeconds(2))
                .connectTimeout(Duration.ofSeconds(3))
                .usePooling()
                .build();

        return new LettuceConnectionFactory(config, clientConfig);
    }

    /**
     * Custom serializer for session attributes.
     * 
     * Why: The default JDK serializer produces ugly, fragile byte arrays.
     * Jackson produces clean JSON that's readable in Redis CLI and 
     * survives serialization library upgrades.
     */
    @Bean
    public RedisSerializer<?> springSessionDefaultRedisSerializer() {
        return new GenericJackson2JsonRedisSerializer();
    }
}
```

---

## Session Repository — Direct Access

```java
@Service
public class SessionService {

    private final RedisOperationsSessionRepository sessionRepo;

    public SessionService(
            RedisOperationsSessionRepository sessionRepo) {
        this.sessionRepo = sessionRepo;
    }

    /**
     * Find all sessions for a user across all instances.
     * Useful for: showing "Active Sessions" in security settings,
     * or force-logging out a compromised account.
     */
    public List<SessionInfo> findUserSessions(String principalName) {
        return sessionRepo.findByIndexNameAndIndexValue(
                SessionRepository.PRINCIPAL_NAME_INDEX_NAME,
                principalName)
            .values()
            .stream()
            .map(s -> new SessionInfo(
                s.getId(),
                s.getCreationTime(),
                s.getLastAccessedTime(),
                s.getMaxInactiveInterval()))
            .toList();
    }

    /**
     * Clean up expired sessions (Redis handles TTL automatically,
     * but you might want to do it immediately after a password change).
     */
    public void invalidateAllSessions(String principalName) {
        sessionRepo.findByIndexNameAndIndexValue(
                SessionRepository.PRINCIPAL_NAME_INDEX_NAME,
                principalName)
            .keySet()
            .forEach(sessionRepo::deleteById);
    }
}
```

---

## Redis Cluster Configuration

For production with multiple Redis nodes:

```yaml
spring:
  session:
    store-type: redis
    redis:
      flush-mode: on_save
      namespace: "myapp:sessions:"
  data:
    redis:
      cluster:
        nodes:
          - redis-node-1:6379
          - redis-node-2:6379
          - redis-node-3:6379
        max-redirects: 3
      lettuce:
        pool:
          max-active: 20
          max-idle: 10
          min-idle: 5
          max-wait: 2000ms
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| No connection pool | Connection exhaustion under load | Enable `usePooling()` with max-active=20 |
| JDK serialization | Fragile, non-readable, upgrade-risky | Use `GenericJackson2JsonRedisSerializer` |
| No Redis TTL | Sessions never expire, Redis memory leaks | Set `maxInactiveIntervalInSeconds` |
| Storing large objects in session | Redis memory explosion, slow serialization | Store entity IDs, fetch full objects in service |
| Redis single point of failure | All sessions lost if Redis crashes | Use Redis Sentinel or Cluster |
