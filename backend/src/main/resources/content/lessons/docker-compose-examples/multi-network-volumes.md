---
title: Docker Compose Networks & Volumes — Isolating Services and Persisting Data
summary: Custom bridge networks for service isolation, named volumes for data persistence, bind mounts for development, and network policies for microservices.
order: 4
minutes: 22
topics: [docker-networks, volumes, bind-mounts, service-isolation, data-persistence]
docs:
  - https://docs.docker.com/compose/networking/
---

## The Concept, From Zero

Docker Compose creates a default network for your services. But in production, you often need to isolate services — for example, your database should only be accessible by your app, not by every container.

Think of networks as walls between rooms. A custom network lets you decide which rooms can talk to each other. Volumes are like external hard drives that persist data even when containers are deleted.

## The Code

```yaml
version: '3.8'

services:
  # Frontend - accessible from outside
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    networks:
      - frontend-net
    depends_on:
      - backend

  # Backend - accessible from frontend only
  backend:
    build: ./backend
    networks:
      - frontend-net
      - backend-net
    depends_on:
      - postgres
      - redis

  # Database - accessible from backend only
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - backend-net
    environment:
      POSTGRES_DB: academy

  # Cache - accessible from backend only
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    networks:
      - backend-net

networks:
  frontend-net:
    driver: bridge
  backend-net:
    driver: bridge
    internal: true  # No external access!

volumes:
  postgres_data:
  redis_data:
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `networks: frontend-net` | Frontend only on frontend-net | Can't reach database directly |
| `networks: backend-net` | Backend on both networks | Bridges frontend and backend layers |
| `internal: true` | Backend-net has no external access | Database and cache are invisible from outside |
| `./init.sql:/docker-entrypoint-initdb.d/` | Bind mount init script | Runs SQL on first database start |
| `./redis.conf:/usr/local/etc/redis/` | Bind mount Redis config | Custom Redis settings without rebuilding image |

## Real-World Scenarios

**Scenario 1: Development with hot reload**
```yaml
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - ./src:/app/src          # Bind mount source code
      - /app/node_modules       # Anonymous volume for dependencies
    environment:
      NODE_ENV: development
```

**Scenario 2: Secrets management**
```yaml
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

**Scenario 3: Multi-tier network isolation**
```yaml
networks:
  dmz:           # Public-facing services
    driver: bridge
  app-tier:      # Application services
    driver: bridge
  data-tier:     # Databases only
    driver: bridge
    internal: true
```

## Key Takeaways

1. **Custom networks** isolate services — use internal: true for databases
2. **Named volumes** persist data across restarts and rebuilds
3. **Bind mounts** are for development (hot reload); volumes are for production
4. **Multiple networks** create security boundaries between service tiers
5. **Secrets** avoid hardcoding passwords in compose files
