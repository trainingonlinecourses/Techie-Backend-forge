---
title: Image Layers — How Docker Stores and Shares
module: docker-deep
order: 2
minutes: 23
topics: ["layers", "union filesystem", "image sharing", "copy-on-write", "image size"]
summary: Every Dockerfile instruction that adds data (RUN, COPY, ENV) creates a layer — an immutable filesystem delta. The final image is a stack of layers,...
docs:
  - title: "About storage drivers"
    url: "https://docs.docker.com/storage/storagedriver/"
---

# Image Layers — How Docker Stores and Shares

## The Concept: Images as a Stack of Layers

Every Dockerfile instruction that *adds data* (`RUN`, `COPY`, `ENV`) creates a **layer** — an immutable filesystem delta. The final image is a **stack of layers**, each one recording only *what changed* in that step.

Think of it like a stack of transparent overhead sheets: each sheet has one change drawn on it; the full picture is all sheets stacked. If a later sheet is identical to one already stacked elsewhere, you reuse the sheet instead of redrawing it.

Two consequences make layers the heart of Docker's efficiency:

1. **Sharing** — two images with the same base (`eclipse-temurin:21-jre`) share those layers on disk. They don't duplicate storage; pulls transfer the shared layers once.
2. **Caching** — a build step whose inputs didn't change reuses the cached layer, skipping the work (and the download).

## The Copy-on-Write Trick

A **container** (running image) doesn't copy the image's layers — it adds a thin **writable layer** on top and uses **copy-on-write**: when the container modifies a file from a lower layer, Docker copies that file up into the writable layer and changes the copy. The image layers stay pristine.

This is why:

- Containers start in milliseconds (no copying the whole image).
- Many containers from one image share memory and disk.
- Container changes never corrupt the image (stop the container, the changes vanish — unless you commit them).

## The Code Walkthrough — Inspecting Your Layers

```bash
# See the layers of an image (smallest to largest, by size):
docker history --no-trunc academy-api:1.0
# IMAGE          CREATED        CREATED BY                                    SIZE
# <sha>         2 minutes ago  ENTRYPOINT ["sh" "-c" "java $JAVA_OPTS ..."]   0B
# <sha>         2 minutes ago  COPY target/academy-api-1.0.0.jar app.jar      73MB
# <sha>         2 minutes ago  USER appuser                                   0B
# <sha>         3 minutes ago  eclipse-temurin:21-jre                         210MB

# Compare the size budget:
docker images | grep academy
# academy-api   1.0   283MB   2 minutes ago

# See what's inside a running container's writable layer:
docker diff <container-id>
# C /app/app.jar        <- changed
# A /tmp/new-file       <- added by the running process
```

### Walking Through Each Part

**`docker history`** — the transparency tool: every layer, its size, and what created it. If your image is bloated, this shows *where*. The base JRE dominates (210 MB); the app jar adds 73 MB; metadata layers are 0 B (they don't add filesystem content).

**Layer sizes matter** — 0 B layers (`USER`, `EXPOSE`, `ENTRYPOINT`) record metadata, not data. Data-adding layers (`RUN`, `COPY`) cost disk, transfer time, and pull time. Keeping the runtime image to base + jar (via multi-stage, previous lesson) is how you keep that number small.

**`docker diff`** — shows the writable layer's changes: which files the running container added/modified. This is also how `docker commit` captures a container's state into a new image (almost always an anti-pattern — rebuild from the Dockerfile instead, so the recipe stays the source of truth).

## The Caching Rules, in Depth

Docker invalidates a layer's cache when:

- The instruction **text** changes (`RUN mvn package` → `RUN mvn package -DskipTests`).
- The **files** copied by a `COPY`/`ADD` change.
- A **base layer** above it changed.

And critically: **when one layer's cache is invalidated, everything after it rebuilds** — even if those later steps didn't change. This is the ordering rule from the previous lesson, seen at the layer level:

```dockerfile
# Good order: dependencies first (rarely change), code last (always changes)
RUN mvn -q dependency:go-offline     # cached unless pom.xml changes
COPY src ./src
RUN mvn -q package                   # cached unless src changes

# Bad order: the code COPY before the dependency fetch
COPY src ./src
RUN mvn dependency:go-offline        # re-downloads every code change!
RUN mvn package
```

## Squashing and Size Control

- **`docker build --squash`** (experimental) collapses all layers into one — smaller, but loses caching and sharing benefits. Usually not worth it.
- **Slim base images** (`-slim`, `alpine`, distroless) — the biggest lever on image size. Distroless images (no shell, no package manager) are the security-conscious choice for runtimes.
- **`.dockerignore`** keeps `COPY . .` from shipping `target/`, `.git`, and logs.

## Common Beginner Pitfalls

1. **Thinking containers copy the image** — they layer on top (copy-on-write); that's why starts are instant.
2. **`docker commit` as a workflow** — capturing container state bakes in ad-hoc changes; rebuild from the Dockerfile instead.
3. **Ignoring layer order** — the cache invalidation cascade rebuilds everything after the first change.
4. **One `RUN` to rule them all** — giant single layers defeat sharing and make debugging hard; split logically (but don't over-split into thousands).
5. **Never checking `docker history`** — the size budget is invisible until it's a problem; inspect regularly.
6. **Modifying files in lower layers at runtime** — copy-on-write makes it work but wastes memory; keep runtime writes minimal (use volumes for real state — next lesson).

## Key Takeaways

- Images = stacks of immutable layers; containers = layers + a thin writable copy-on-write layer.
- Shared base layers save disk and bandwidth; cached layers save build time.
- Layer order drives caching: dependencies first, code last.
- `docker history` shows the size budget; slim bases and multi-stage shrink it.
- Containers start fast because they don't copy the image.
- Rebuild from the recipe; never `docker commit` ad-hoc state.
