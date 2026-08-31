# ---- Build stage -------------------------------------------------------------
# Build context is the backend/ directory (see render.yaml / Railway root dir).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Copy POM first to cache dependency resolution across rebuilds.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
RUN rm -rf src
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- Runtime stage -----------------------------------------------------------
FROM eclipse-temurin:21-jre
ARG CACHE_BUST=1
LABEL build-date="2026-08-31-v6"
WORKDIR /app
# The platform injects PORT; Spring Boot reads it from application.yml.
ENV PORT=8080
COPY --from=build /build/target/academy-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "app.jar"]
