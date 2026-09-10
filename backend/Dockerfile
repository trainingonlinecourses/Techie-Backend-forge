# ---- Build stage -------------------------------------------------------------
# Build context is the backend/ directory (see render.yaml / Railway root dir).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Copy POM first to cache dependency resolution across rebuilds.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
ARG CACHE_BUST_SRC=1
RUN rm -rf src
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- Runtime stage -----------------------------------------------------------
FROM eclipse-temurin:21-jre
ARG CACHE_BUST=3
LABEL build-date="2026-09-07-rebuild-v1"
WORKDIR /app
# The platform injects PORT; Spring Boot reads it from application.yml.
ENV PORT=8080
COPY --from=build /build/target/academy-api-*.jar app.jar
EXPOSE 8080
# Render free tier gives the container 512 MB. The JDK's container-aware default
# heap is 25% of that (128 MB) — too small for Hibernate + 900 content rows, which
# shows up as GC thrash/OOM crash-loops that look like "service never starts".
# 75% heap + SerialGC (right choice for small heaps) keeps startup fast and stable.
# (Container support is on by default, which is what makes MaxRAMPercentage work.)
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+UseSerialGC", \
  "-XX:+ExitOnOutOfMemoryError", "-jar", "app.jar"]
