---
title: Starter Structure — Anatomy of a Spring Boot Starter
summary: The directory layout, META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports, dependency management, and how starters compose together.
order: 3
minutes: 15
topics: [starter-structure, auto-configuration, imports, dependency-management, layout]
docs:
  - https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html
---

## The Concept, From Zero

A Spring Boot starter is just a JAR with dependencies and an auto-configuration class. The "magic" is in the `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` file that tells Spring Boot what to configure.

```
my-starter/
├── pom.xml
└── src/main/java/
    └── com/example/
        └── MyAutoConfiguration.java
└── src/main/resources/
    └── META-INF/
        └── spring/
            └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

---

## Line-by-Line Walkthrough

### Directory Layout

```
my-starter/
├── pom.xml                          # Dependencies
├── src/main/java/
│   └── com/example/auto/
│       └── MyAutoConfiguration.java # Configuration class
├── src/main/resources/
│   └── META-INF/
│       └── spring/
│           └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
└── src/main/resources/
    └── defaults.properties          # Default config (optional)
```

### AutoConfiguration.imports

```properties
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.auto.MyAutoConfiguration
```

### Configuration Class

```java
package com.example.auto;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnClass(MyService.class)  // only if MyService is on classpath
public class MyAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean  // only if user hasn't defined their own
    public MyService myService() {
        return new MyService();
    }
}
```

### pom.xml

```xml
<project>
    <groupId>com.example</groupId>
    <artifactId>my-starter</artifactId>
    <version>1.0.0</version>

    <dependencies>
        <!-- What the starter provides -->
        <dependency>
            <groupId>com.example</groupId>
            <artifactId>my-core-lib</artifactId>
        </dependency>

        <!-- Optional: only needed if user wants this feature -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-autoconfigure</artifactId>
        </dependency>
    </dependencies>
</project>
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using @EnableAutoConfiguration imports file | Old format, deprecated | Use AutoConfiguration.imports |
| Not conditional on missing bean | User can't override | Always use @ConditionalOnMissingBean |
| Too many required dependencies | Starter bloats classpath | Make optional deps optional |
| Not version-managing dependencies | Version conflicts | Use BOM or dependency management |
