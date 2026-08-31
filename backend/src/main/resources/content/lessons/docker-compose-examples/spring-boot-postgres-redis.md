---
title: Spring Boot + PostgreSQL + Redis — Production-Ready Compose Stack
summary: Complete Docker Compose configuration for a Spring Boot app with PostgreSQL database and Redis cache, including health checks, volumes, and environment variables.
order: 3
minutes: 20
topics: [docker-compose, postgresql, redis, spring-boot, health-checks]
docs:
  - https://docs.docker.com/compose/compose-file/compose-file-v3/
---

## The Concept, From Zero

When you deploy a Spring Boot application, it rarely runs alone. You need a database (PostgreSQL), a cache (Redis), and your application server. Docker Compose lets you define all three services in one file and start them with a single command.

Think of Docker Compose as a recipe: each service is an ingredient, and the compose file tells Docker how to mix them together — what networks to use, what volumes to mount, and how to know when each service is ready.

## The Code

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: academy-db
    environment:
      POSTGRES_DB: academy
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: academy-cache
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Spring Boot Application
  app:
    build: .
    container_name: academy-app
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/academy
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres123
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 15s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `version: '3.8'` | Specifies Compose file format | Ensures compatibility with Docker Engine 19.03+ |
| `postgres:16-alpine` | Uses PostgreSQL 16 on Alpine Linux | Alpine is tiny (~5MB) vs full image (~400MB) |
| `POSTGRES_DB: academy` | Creates the database automatically | No manual DB setup needed on first run |
| `volumes:` on postgres | Persists data to named volume | Data survives container restarts |
| `healthcheck:` on postgres | Runs `pg_isready` every 10s | Downstream services wait until DB is truly ready |
| `redis:7-alpine` | Uses Redis 7 on Alpine | Lightweight cache server |
| `redis_data:/data` | Persists Redis data | Cache survives restarts |
| `build: .` | Builds from local Dockerfile | Uses your app's Dockerfile |
| `SPRING_DATASOURCE_URL` | Points to postgres service | Uses Docker DNS (service name = hostname) |
| `SPRING_DATA_REDIS_HOST: redis` | Points to redis service | Docker networking handles resolution |
| `depends_on` + condition | Waits for healthy services | App won't start until DB and cache are ready |
| `named volumes` | postgres_data, redis_data | Data persists across `docker-compose down` |

## Real-World Scenarios

**Scenario 1: Local Development**
```bash
# Start everything
docker-compose up -d

# Watch logs
docker-compose logs -f app

# Stop and preserve data
docker-compose down

# Full reset (destroys data)
docker-compose down -v
```

**Scenario 2: CI/CD Pipeline**
```yaml
# In your GitHub Actions workflow
- name: Start test dependencies
  run: docker-compose up -d postgres redis
- name: Run tests
  run: mvn test
- name: Stop dependencies
  run: docker-compose down
```

**Scenario 3: Adding monitoring**
```yaml
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
```

## Key Takeaways

1. **Named volumes** persist data — use them for databases and caches
2. **Health checks** prevent race conditions where the app starts before the DB is ready
3. **depends_on with condition** waits for health checks, not just container start
4. **Alpine images** save 90%+ disk space compared to full images
5. **Environment variables** configure the app without hardcoding connection strings
