---
title: Docker Compose — Multi-Container Apps Made Manageable
module: docker-deep
order: 3
minutes: 24
topics: ["docker-compose.yml", "services", "networks", "dependencies", "dev environments"]
summary: A real application is rarely one container: the backend, the database, Redis, RabbitMQ — each is a container, and they must network together, know ...
docs:
  - title: "Docker Compose overview"
    url: "https://docs.docker.com/compose/"
---

# Docker Compose — Multi-Container Apps Made Manageable

## The Concept: The App Is a Team of Containers

A real application is rarely one container: the backend, the database, Redis, RabbitMQ — each is a container, and they must **network together**, know each other's addresses, and start in the right order. Running them with a dozen `docker run` commands with `--link` flags and hand-managed networks is chaos.

**Docker Compose** describes the *whole team* in one YAML file — `docker-compose.yml` — and manages it with a few commands:

```bash
docker compose up -d        # start the whole stack
docker compose logs -f      # follow all logs
docker compose down         # stop everything
```

One file declares every service, its image/build, its ports, its environment, its dependencies, and the network that connects them. `docker compose up` does the rest.

## The Code Walkthrough

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: academy
      POSTGRES_USER: academy
      POSTGRES_PASSWORD: ${DB_PASSWORD:-devpass}      # env substitution with default
    volumes:
      - db-data:/var/lib/postgresql/data              # persisted beyond container life
    healthcheck:                                      # the "is it ready?" probe
      test: ["CMD-SHELL", "pg_isready -U academy"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"        # AMQP (app)
      - "15672:15672"      # management UI (dev only)
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build: ./backend                     # build from the Dockerfile
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/academy   # service name = hostname
      SPRING_DATASOURCE_USERNAME: academy
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-devpass}
      SPRING_RABBITMQ_HOST: rabbitmq
    depends_on:
      db:
        condition: service_healthy       # wait for db's healthcheck, not just startup
      rabbitmq:
        condition: service_healthy
    volumes:
      - ./backend/target:/app            # optional: live-mount for dev

  frontend:
    build: ./frontend
    ports:
      - "4173:4173"

volumes:
  db-data:                              # named volume — survives `down`
```

### Walking Through Each Part

**Services** — each container is a `service`: an image (`image:`) or a build (`build: ./backend` from its Dockerfile). Compose builds and runs all of them together.

**Networking by name** — this is the magic: inside the Compose network, the backend reaches Postgres at **`db:5432`** — the *service name is the hostname*. No IPs, no links; `SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/academy` just works. This is how containers find each other on the Compose network.

**Volumes** — `db-data:/var/lib/postgresql/data` is a **named volume**: the database's data lives outside the container's writable layer, so `docker compose down` (which removes containers) keeps the data. This is the "persistence" concept in Docker: containers are ephemeral; volumes are durable.

**Healthchecks** — each service declares its readiness probe. `depends_on` with `condition: service_healthy` makes the backend wait until Postgres *passes its probe* — not merely until the container started (a started Postgres is still booting). This is the correct way to sequence containers (vs arbitrary sleeps).

**Environment with defaults** — `${DB_PASSWORD:-devpass}` reads the host's env var with a fallback — the same externalized-config principle as the Spring config module, at the Compose level.

## Compose in Dev vs Production

| | Dev (this file) | Production (Render/K8s) |
|---|---|---|
| Purpose | Fast local iteration | Managed deployment |
| Builds | `build: ./backend` | Prebuilt images from CI |
| Secrets | Env defaults, `.env` file | Secret manager / platform env |
| Orchestration | `docker compose` | Platform (Render, Kubernetes) |

Compose is *the* standard for local development: one command spins up the entire stack — backend, Postgres, Redis — exactly matching production topology. For production, the same mental model (services, networks, healthchecks) transfers to platforms that manage containers for you.

## The Common Compose Commands

```bash
docker compose up -d             # build + start all services (detached)
docker compose up -d db          # start just one service
docker compose ps                # status of all services
docker compose logs -f backend   # follow one service's logs
docker compose exec backend bash # shell into a running container
docker compose down              # stop + remove containers (keeps volumes)
docker compose down -v           # ALSO remove volumes (destroys data!) — careful
docker compose build             # rebuild images
```

## Common Beginner Pitfalls

1. **No healthchecks + bare `depends_on`** — the backend starts before the DB is ready and crashes on retry; use `condition: service_healthy`.
2. **Data loss on `down -v`** — the `-v` flag deletes volumes; in dev it's intentional, in any environment with real data it's catastrophic.
3. **Hardcoded secrets in the YAML** — commit the file and you've committed the password; use `${VAR}` + `.env` (gitignored).
4. **Port conflicts** — two services on `8080:8080` collide; change the host port (`8081:8080`).
5. **Forgetting the `.env` file** — `docker compose` reads `.env` for substitution; a missing `.env` with no defaults breaks the stack.
6. **Building in production** — prod should pull *built images* from a registry, not `build:` from source; keep the Dockerfile for CI, not the production host.

## Key Takeaways

- Compose declares the whole container team in one YAML: services, networks, volumes, healthchecks.
- Service names are hostnames inside the Compose network — no IP juggling.
- Volumes persist data beyond container life; `down` keeps them, `down -v` destroys them.
- Healthchecks + `depends_on: condition: service_healthy` = correct startup sequencing.
- Externalize secrets with `${VAR:-default}` and a gitignored `.env`.
- Compose for dev is the standard; production uses the same model through managed platforms.
