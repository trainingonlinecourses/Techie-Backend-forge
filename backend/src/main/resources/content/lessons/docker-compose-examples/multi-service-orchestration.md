---
title: Docker Compose — Multi-Service Application Orchestration
summary: How Docker Compose defines and runs multi-container applications — networking, volumes, environment variables, and real-world stack configurations for Spring Boot + databases + caches.
order: 1
minutes: 28
topics: [docker-compose, multi-container, networking, volumes, environment-variables, profiles]
docs:
  - https://docs.docker.com/compose/
  - https://docs.docker.com/compose/compose-file/
---

## The Concept, From Zero

Docker Compose lets you define an entire application stack — your Spring Boot backend, PostgreSQL database, Redis cache, RabbitMQ message broker, and Nginx reverse proxy — in a **single YAML file**. One command (`docker compose up`) starts everything, properly networked and configured.

**Why Docker Compose matters:**

- **Development environments** — New developers run one command and have the entire stack running
- **Testing** — Spin up isolated test databases and services per test run
- **Local debugging** — Replicate production-like multi-service architectures on your laptop
- **CI/CD pipelines** — Test against real databases in GitHub Actions / Jenkins

**Without Docker Compose**, you'd need to: install each service locally, configure ports manually, manage connection strings, set up networking between services, and handle version compatibility.

---

## Anatomy of docker-compose.yml

```yaml
# Version is now optional (Compose V2 infers it)
# Top-level services define your containers
services:
  
  # Service 1: Spring Boot Application
  app:
    build:
      context: .
      dockerfile: Dockerfile           # Build the app image from Dockerfile
    ports:
      - "8080:8080"                     # Host:Container port mapping
    environment:
      - SPRING_PROFILES_ACTIVE=docker   # Activate Spring "docker" profile
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/myapp
      - SPRING_DATASOURCE_USERNAME=postgres
      - SPRING_DATASOURCE_PASSWORD=secret
      - SPRING_REDIS_HOST=redis
    depends_on:
      db:
        condition: service_healthy      # Wait for DB to be ready
      redis:
        condition: service_started
    networks:
      - backend                         # Connect to "backend" network
    restart: unless-stopped

  # Service 2: PostgreSQL Database
  db:
    image: postgres:16-alpine           # Use official PostgreSQL image
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data  # Persist data across restarts
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql  # Run SQL on first start
    ports:
      - "5432:5432"                     # Expose to host for local debugging
    healthcheck:                         # Define how to check if DB is ready
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Service 3: Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data                 # Persist Redis AOF/RDB data
    command: redis-server --appendonly yes  # Enable persistence
    networks:
      - backend

# Named volumes — persist data beyond container lifecycle
volumes:
  pgdata:
  redisdata:

# Isolated network — services communicate by service name
networks:
  backend:
    driver: bridge
```

---

## Line-by-Line Deep Dive

### Building Images

```yaml
# Option 1: Build from a Dockerfile
app:
  build:
    context: .                    # Build context — files sent to Docker daemon
    dockerfile: Dockerfile        # Which Dockerfile to use
    args:                         # Build-time variables
      JAVA_VERSION: 21
    target: production            # Multi-stage build target

# Option 2: Use a pre-built image
app:
  image: myregistry/myapp:latest

# Option 3: Short form
app:
  build: .    # Uses default Dockerfile in current directory
```

### Port Mapping

```yaml
ports:
  - "8080:8080"           # hostPort:containerPort
  - "5432:5432"           # Expose PostgreSQL to host
  - "127.0.0.1:9090:9090" # Only accessible from localhost
  - "9000-9010:9000-9010" # Port range
```

### Environment Variables

```yaml
environment:
  # Simple key=value
  - SPRING_PROFILES_ACTIVE=docker
  
  # Reference other services (Compose resolves DNS)
  - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/myapp
  #                                                              ↑ "db" = service name
  
  # Reference host environment variables
  - DB_PASSWORD=${DB_PASSWORD}    # Reads from .env file or shell
  - API_KEY=${API_KEY}
```

### Volumes

```yaml
volumes:
  # Named volumes (managed by Docker)
  - pgdata:/var/lib/postgresql/data
  
  # Bind mounts (map host directory to container)
  - ./src:/app/src               # Live reload in development
  - ./config:/app/config:ro      # Read-only mount
  
  # Anonymous volumes (auto-generated name)
  - /tmp/cache
```

### Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
  interval: 30s          # How often to check
  timeout: 10s           # Max time for each check
  retries: 3             # Failures before marking unhealthy
  start_period: 40s      # Grace period for startup
```

### Dependency Ordering

```yaml
depends_on:
  db:
    condition: service_healthy    # Wait for health check to pass
  redis:
    condition: service_started    # Just wait for container to start
```

---

## Real-World Compose Files

### Production-Ready Spring Boot Stack

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=production
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/myapp
      - SPRING_DATASOURCE_USERNAME=${DB_USER}
      - SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD}
      - SPRING_REDIS_HOST=redis
      - MANAGEMENT_ENDPOINTS_WEB_EXPOSURE=health,info,metrics
      - JAVA_OPTS=-Xmx512m -Xms256m
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.0"
    restart: unless-stopped
    networks:
      - frontend
      - backend

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - backend
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
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
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:

networks:
  frontend:
  backend:
```

### Development Stack with Hot Reload

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev        # Dev Dockerfile with DevTools
    ports:
      - "8080:8080"
      - "5005:5005"                      # Remote debugger
    volumes:
      - ./src:/app/src                   # Live source reload
      - ./target:/app/target
      - ~/.m2:/root/.m2                 # Cache Maven dependencies
    environment:
      - SPRING_PROFILES_ACTIVE=dev
      - SPRING_DEVTOOLS_RELOAD_TRIGGER=filesystem
      - JAVA_OPTS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"                     # Exposed for IDE database tools
    volumes:
      - pgdata_dev:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # pgAdmin for database management
  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: dev@example.com
      PGADMIN_DEFAULT_PASSWORD: dev
    ports:
      - "5050:80"
    depends_on:
      - db

volumes:
  pgdata_dev:
```

---

## Essential Commands

```bash
# Start all services (builds images first)
docker compose up

# Start in background (detached)
docker compose up -d

# Rebuild images (when Dockerfile or code changes)
docker compose up --build

# Stop and remove containers, networks
docker compose down

# Stop and remove EVERYTHING (including volumes — data lost!)
docker compose down -v

# View logs
docker compose logs -f app           # Follow logs for one service
docker compose logs --tail=100       # Last 100 lines of all services

# Execute command in running container
docker compose exec db psql -U postgres -d myapp

# Scale a service
docker compose up -d --scale app=3

# Check status
docker compose ps

# View resource usage
docker compose top
```

---

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| App starts before DB is ready | Connection refused errors | Use `depends_on` with `condition: service_healthy` |
| Using `localhost` in URLs | Inside containers, localhost = the container itself | Use service names: `db`, `redis` |
| No health checks | `depends_on: service_started` doesn't mean "ready" | Add `healthcheck` and use `condition: service_healthy` |
| No volume for DB data | Data lost on every `docker compose down` | Always mount data directories to named volumes |
| Hardcoded credentials | Security risk in version control | Use `.env` file and `${VAR}` references |
| Port conflicts | Two services on same host port | Check with `lsof -i :8080` before choosing ports |
| Forgetting `-d` flag | Terminal blocked by logs | Use `docker compose up -d` for background |

---

## Docker Compose Profiles

Use profiles to run optional services only when needed:

```yaml
services:
  app:
    build: .
    ports: ["8080:8080"]

  db:
    image: postgres:16-alpine

  # Only runs with: docker compose --profile debug up
  debug-tools:
    image: busybox
    profiles:
      - debug

  # Only runs with: docker compose --profile monitoring up
  prometheus:
    image: prom/prometheus
    profiles:
      - monitoring
```

```bash
docker compose up -d                    # Only app + db
docker compose --profile debug up -d    # App + db + debug-tools
```
