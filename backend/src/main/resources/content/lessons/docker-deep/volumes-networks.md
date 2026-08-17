---
title: Volumes and Networks — State and Connectivity
module: docker-deep
order: 4
minutes: 24
topics: ["volumes", "bind mounts", "bridge networks", "container networking", "data persistence"]
docs:
  - title: "Manage data in Docker"
    url: "https://docs.docker.com/storage/"
---

# Volumes and Networks — State and Connectivity

## The Concept: Containers Are Ephemeral; Data and Networks Are Not

Two facts shape everything about running containers:

1. **Containers are disposable** — stop one and its filesystem changes vanish (they live in the writable layer, previous lesson). But databases, uploads, and logs must survive container restarts. That's what **volumes** are for: durable storage *outside* the container's life.
2. **Containers need to talk** — the backend must reach the database. That's what **networks** are for: the connectivity layer that lets containers find each other by name and isolates them from unwanted traffic.

Think of it as a set of shipping containers (containers) at a port: the cargo you care about is stored in the *warehouse* (volume), not inside the shipping container itself (which gets hauled away). And the port has roads between the berths (network) — trucks (packets) travel by address.

## Volumes — Three Flavors

### 1. Named volumes (Docker-managed)

```bash
docker volume create db-data
docker run -v db-data:/var/lib/postgresql/data postgres:16
```

Docker owns the storage location; you name it (`db-data`) and mount it at a container path. Data survives `docker rm` and `docker compose down`. **The default for state you care about.**

### 2. Bind mounts (host paths)

```bash
# Share a host directory with the container (dev hot-reload):
docker run -v "$(pwd)/backend/target:/app" academy-api

# Or in Compose:
# volumes:
#   - ./backend/target:/app
```

The host path *is* the storage. Perfect for dev (edit on the host, the container sees it) and for config files. Fragile for production (depends on host layout).

### 3. tmpfs (in-memory)

```bash
docker run --tmpfs /run:rw,noexec,nosuid myapp
```

RAM-backed, disappears with the container. Use for ephemeral runtime state (sockets, scratch), never for data you need.

## Networks — The Three Defaults

| Network | Isolation | Use |
|---|---|---|
| `bridge` (default) | Containers on the same bridge can talk by name; isolated from the host | Most apps |
| `host` | Shares the host's network stack directly (no port mapping) | Perf-sensitive, single-container |
| `none` | No network | Isolated/offline workloads |

Custom networks give you **isolation by design**: put the database on a network only the backend joins — the frontend can't reach it even if compromised:

```bash
docker network create app-net

docker run -d --network app-net --name db postgres:16
docker run -d --network app-net --name backend -p 8080:8080 academy-api
# backend reaches 'db' by name; nothing else on this network can

docker network inspect app-net   # see who's attached
```

## The Code Walkthrough — The Full Pattern

```yaml
# docker-compose.yml — volumes + networks made explicit
services:
  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data    # named volume: durable data
    networks:
      - internal                            # only the backend sees this
    # (no ports! the db is NOT exposed to the host — only to the network)

  backend:
    build: ./backend
    ports:
      - "8080:8080"                         # the ONLY host-facing port
    networks:
      - internal
    depends_on:
      db:
        condition: service_healthy

networks:
  internal:                                 # a private bridge network

volumes:
  db-data:                                  # named volume declaration
```

### Walking Through Each Part

**The named volume** — `db-data` holds Postgres's files. `docker compose down` removes containers but keeps `db-data`; `docker compose up` reattaches it. The database survives *anything* except `down -v`.

**The private network** — only services on `internal` can talk. The db has **no host ports** — it's reachable only at `db:5432` inside the network. From the host, Postgres is invisible. This is the security model: the backend is the single entry point (port 8080); the database is internal.

**Port mapping** — `8080:8080` means host port 8080 → container port 8080. Only *needed* services expose ports. A database, a queue, or a cache typically exposes nothing to the host in production.

## The State Checklist

| What | Where | Survives container restarts? |
|---|---|---|
| Database files | Named volume | ✅ (until `down -v`) |
| Uploaded files | Volume or object storage | ✅ |
| Logs | Volume or a log sink | ✅ (if mounted) |
| App code | Image (immutable) | Rebuilt, not persisted |
| Runtime scratch | tmpfs / writable layer | ❌ (by design) |

**The rule:** if it must survive, it goes in a volume. If it's derived (build artifacts, caches), keep it out of volumes (rebuild instead).

## Common Beginner Pitfalls

1. **No volume for the database** — `down` loses all data; the classic "my data disappeared" incident.
2. **`down -v` on real data** — the `-v` flag deletes volumes; catastrophic in any non-disposable environment.
3. **Exposing everything to the host** — databases and caches with host ports are reachable from outside; keep them internal-only.
4. **Bind mounts in production** — host-dependent paths break on other machines; use named volumes or object storage in prod.
5. **Container-to-container via `localhost`** — inside Docker, `localhost` is the container itself; reach other containers by *service name* (`db`, not `127.0.0.1`).
6. **One giant default bridge** — everything can reach everything; use custom networks for isolation.

## Key Takeaways

- Containers are ephemeral; volumes are durable state outside them.
- Named volumes (Docker-managed) for state; bind mounts for dev/config; tmpfs for scratch.
- Custom networks give name-based discovery + isolation.
- The db lives on the internal network with no host ports; the backend is the single entry point.
- Data survives `down` but not `down -v` — treat `-v` with respect.
- Inside a network, reach services by name, not `localhost`.
