---
title: Packaging — Fat Jars, Layered Jars and Buildpacks
summary: How the Spring Boot repackaged jar works, layered jars for efficient Docker images, and Cloud Native Buildpacks for image builds without Dockerfiles.
order: 18
minutes: 18
topics: [packaging, fat-jar, layered-jars, buildpacks, docker-image, spring-boot-maven-plugin, deploy]
docs:
  - https://docs.spring.io/spring-boot/reference/packaging.html
  - https://docs.spring.io/spring-boot/reference/packaging/container-images.html
---

# Packaging — Fat Jars, Layered Jars and Buildpacks

## The concept: how a Spring Boot app is packaged

A normal Maven jar is just your classes. A Spring Boot app needs its **dependencies** — Spring, Jackson, Hibernate, everything — plus a launcher. The `spring-boot-maven-plugin`'s `repackage` goal produces a **fat (executable) jar**:

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
</plugin>
```

The result: your code + all dependencies + `org.springframework.boot.loader` classes (the custom classloader that loads nested jars from inside the fat jar). You run it with plain `java -jar app.jar` — no classpath juggling, no `-cp`. Inside the jar:

```text
app.jar
├── BOOT-INF/classes/          ← your compiled classes + resources
├── BOOT-INF/lib/              ← every dependency jar (nested jars)
├── META-INF/                  ← manifest (Main-Class: JarLauncher) + signatures
└── org/springframework/boot/loader/  ← the launcher machinery
```

## Layered jars — the Docker optimization

Since Boot 2.3, the repackaged jar is **layered**: its contents are split by how often they change, so Docker image layers can be **cached**:

```properties
# spring-boot-maven-plugin configuration
<configuration>
  <layers><enabled>true</enabled></layers>
</configuration>
```

Default layers:

| Layer | Contents | Changes |
|---|---|---|
| `dependencies` | all lib jars | rarely |
| `spring-boot-loader` | the launcher | rarely |
| `snapshot-dependencies` | SNAPSHOT libs | sometimes |
| `application` | your classes + resources | every build |

A Dockerfile that copies layers separately lets Docker reuse cached layers:

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build app.jar app.jar
# Extract layers so each COPY is its own Docker layer:
RUN java -Djarmode=layertools -jar app.jar extract
COPY --from=build app/dependencies/ ./
COPY --from=build app/spring-boot-loader/ ./
COPY --from=build app/snapshot-dependencies/ ./
COPY --from=build app/application/ ./
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Why it matters:** with layers, a code-only change rebuilds *only* the tiny `application` layer — dependency layers come from the cache. Without layers, every push rebuilds and re-uploads the whole ~200MB image. For a service deployed every push, this is minutes of build+push time saved per release. (`java -Djarmode=layertools -jar app.jar extract` is the command that splits the jar.)

## Cloud Native Buildpacks — images without Dockerfiles

`spring-boot-maven-plugin` can build an OCI image directly via **Buildpacks** (Paketo), no Dockerfile at all:

```bash
./mvnw spring-boot:build-image
# or with the plugin configured:
#   <image><name>registry.example.com/academy-api:${project.version}</name></image>
```

Buildpacks detect the app (Java), pick a runtime (Temurin JRE), apply layers (dependencies vs application — same layering), and produce a hardened image with sensible defaults. Benefits: no Dockerfile to maintain, automatic base-image security updates, consistent layering. The trade-off: less control than a hand-written Dockerfile and the build needs a container runtime.

## How we use it in an organization: the scenarios

**Scenario 1 — the standard CI pipeline.** `mvn -DskipTests package` → fat jar → docker build (layered) → push → deploy. The layering config is a one-time setup that pays off on every release.

**Scenario 2 — serverless/function packaging.** The fat jar is a single artifact — copy it to a VM, run `java -jar`. For functions-as-a-service, the same jar runs in a function image; native compilation (see the startup-performance lesson) is the further step.

**Scenario 3 — reproducible builds.** Pin the base image tag (`eclipse-temurin:21-jre`, not `latest`), use a digest-pinned image in prod, and keep `layers` enabled so cache reuse is deterministic.

**Scenario 4 — Buildpacks-first teams.** Teams that standardize on Paketo get images with auto-updated base runtimes and no Dockerfile drift.

## JAR vs WAR

- **JAR (default, recommended)** — embedded Tomcat/Netty; `java -jar`; container-friendly.
- **WAR** — for legacy app servers (external Tomcat): `packaging war` + `spring-boot-starter-tomcat` scoped `provided`. Modern deployments rarely need WARs.

## Pitfalls

- **`java -jar` with a plain (non-repackaged) jar fails** — no `Main-Class` launcher. Run `mvn package` (which repackages), not the raw compile output.
- **Nested jar classloading quirks** — the loader handles nested jars, but some libraries that read their own jar paths (`getResource` on their own jar) behave differently inside a fat jar; `Loader` mode vs exploded mode (`-Dloader.path=...`) is the escape hatch.
- **Layer cache invalidation** — if you copy the whole jar as one layer, caching is lost; the layered COPY pattern is what makes it work.
- **Unsigned/Signed jars** — repackaging strips signatures; not usually an issue but surprises teams coming from signed-JAR enterprise environments.
- **Image size** — a fat jar image includes all dependencies; that's the point, but trim unused starters and use the JRE (not JDK) base image.

## Key takeaways

- The fat jar = your code + dependencies + the Spring Boot launcher; run with `java -jar`.
- Layered jars split dependencies from application code so Docker caches survive code-only changes.
- Use `java -Djarmode=layertools -jar app.jar extract` + per-layer COPYs for efficient images.
- Buildpacks (`spring-boot:build-image`) build images without a Dockerfile — hardened, layered defaults.
- Pin base-image tags, prefer JAR packaging, and keep layers enabled for CI speed.
