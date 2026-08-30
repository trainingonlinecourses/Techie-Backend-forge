---
title: Spring Boot + Docker Compose — Full Production Stack
summary: Real-world Docker Compose configurations for Spring Boot applications with PostgreSQL, Redis, monitoring, reverse proxy, and CI/CD integration.
order: 2
minutes: 25
topics: [spring-boot-docker, production-stack, nginx-reverse-proxy, monitoring, ci-cd]
docs:
  - https://docs.docker.com/samples/spring-boot-containerize/
  - https://spring.io/guides/gs/spring-boot-docker/
---

## The Concept, From Zero

In production, your Spring Boot app doesn't run alone — it needs a database, cache, monitoring, logging, and a reverse proxy. Docker Compose lets you define this entire production stack and deploy it to any Docker host.

This lesson covers a **real-world production configuration** you'd actually deploy.

---

## Complete Production Stack

### Project Structure

```
myapp/
├── docker-compose.yml
├── docker-compose.prod.yml      # Production overrides
├── .env                          # Environment variables (never commit!)
├── Dockerfile                    # Multi-stage build
├── nginx/
│   ├── nginx.conf
│   └── ssl/
├── sql/
│   └── init.sql
├── monitoring/
│   ├── prometheus.yml
│   └── alertmanager.yml
└── src/
```

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN ./mvnw dependency:go-offline -B
COPY src ./src
RUN ./mvnw package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

# Security: Run as non-root
USER app

# JVM tuning for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -XX:+UseG1GC \
    -XX:+UseStringDeduplication"

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### Nginx Reverse Proxy Configuration

```nginx
# nginx/nginx.conf
upstream backend {
    server app:8080;    # Docker Compose service name resolves to container IP
}

server {
    listen 80;
    server_name myapp.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name myapp.com;
    
    # SSL certificates
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }
    
    # Static files (if serving from Nginx)
    location /static/ {
        alias /app/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check endpoint (no rate limiting)
    location /health {
        proxy_pass http://backend/actuator/health;
        access_log off;
    }
}
```

### Monitoring with Prometheus

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'spring-boot'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['app:8080']
    scrape_interval: 10s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### Production docker-compose.yml

```yaml
services:
  app:
    build: .
    environment:
      - SPRING_PROFILES_ACTIVE=production
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/myapp
      - SPRING_DATASOURCE_USERNAME=${DB_USER}
      - SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD}
      - SPRING_REDIS_HOST=redis
      - MANAGEMENT_ENDPOINTS_WEB_EXPOSURE=health,info,metrics,prometheus
      - MANAGEMENT_PROMETHEUS_EXPORT_ENABLED=true
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.0"
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/init:/docker-entrypoint-initdb.d
    command: >
      postgres
        -c shared_buffers=256MB
        -c effective_cache_size=768MB
        -c work_mem=16MB
        -c maintenance_work_mem=128MB
        -c max_connections=100
        -c log_statement=mod
        -c log_min_duration_statement=1000
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: >
      redis-server
        --appendonly yes
        --maxmemory 256mb
        --maxmemory-policy allkeys-lru
        --save 60 1000
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - frontend
      - backend
    restart: unless-stopped

  prometheus:
    image: prom/prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - promdata:/prometheus
    ports:
      - "9090:9090"
    networks:
      - backend

  grafana:
    image: grafana/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafdata:/var/lib/grafana
    ports:
      - "3000:3000"
    networks:
      - backend
    depends_on:
      - prometheus

volumes:
  pgdata:
  redisdata:
  promdata:
  grafdata:

networks:
  frontend:
  backend:
```

### Environment File (.env)

```bash
# .env — NEVER commit this to version control!
DB_USER=myapp_prod
DB_PASSWORD=super_secret_password_here
GRAFANA_PASSWORD=admin_password
```

---

## Deployment Commands

```bash
# First time setup
docker compose up -d

# Update application (rebuild only the app image)
docker compose up -d --build app

# View all logs
docker compose logs -f

# Database backup
docker compose exec db pg_dump -U myapp_prod myapp > backup.sql

# Database restore
cat backup.sql | docker compose exec -T db psql -U myapp_prod myapp

# Scale app for load testing
docker compose up -d --scale app=3

# Monitor resources
docker stats
docker compose top
```

---

## Common Mistakes

| Mistake | Risk | Fix |
|---------|------|-----|
| No health checks | App starts before DB is ready | Add `healthcheck` + `condition: service_healthy` |
| Running as root | Container escape vulnerability | Use `USER app` in Dockerfile |
| No resource limits | One container starves others | Set `deploy.resources.limits` |
| Hardcoded secrets | Secrets in git history | Use `.env` file or Docker secrets |
| No log rotation | Disk fills up | Configure `logging` driver with max-size/max-file |
| No SSL termination | Data in transit is plaintext | Use Nginx with SSL certificates |
| Default bridge network | No service discovery | Create explicit named networks |
