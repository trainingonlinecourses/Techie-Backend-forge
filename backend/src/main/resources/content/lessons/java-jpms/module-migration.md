---
title: Migrating to JPMS — Step by Step
summary: How to migrate an existing Java project to the module system, handling split packages, automatic modules, and the --add-opens workaround.
order: 2
minutes: 20
topics: [migration, split-packages, automatic-modules, add-opens, modular-path]
docs:
  - https://openjdk.org/projects/jigsaw/doc/tutorials/MigrationToModules.html
---

## The Concept, From Zero

Migrating to JPMS is done incrementally — you don't have to modularize everything at once. The module system supports automatic modules (JARs without module-info.java) and the `--add-opens` flag for legacy code.

```
Step 1: Run on module path (no module-info.java yet)
Step 2: Create automatic modules
Step 3: Create module-info.java
Step 4: Fix split packages and missing exports
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Step 1: Run on module path (even without module-info.java). $ java --module-path libs/ -m myapp/com.example.Main. JARs without module-info.java become "automatic modules"
2. Step 2: Automatic module names. Automatic modules get names from the JAR filename: mylib-1.0.jar → automatic module name: mylib. You can also set it in MANIFEST.MF: Automatic-Module-Name: com.example.mylib
3. Step 3: Create module-info.java
4. `requires java.sql;` — platform module
5. `requires com.fasterxml.jackson.databind;` — third-party
6. `requires mylib;` — automatic module
7. `exports com.example.api;` — public API
8. `opens com.example.model to` — allow reflection
9. Step 4: Fix split packages. Two JARs providing the same package → split package error. Solution: merge the packages or use --patch-module
10. Step 5: Workarounds for legacy code. --add-opens (allow deep reflection). $ java --add-opens java.base/java.lang=ALL-UNNAMED -jar app.jar

The same code, clean:

```java
module com.example.myapp {
    requires java.sql;
    requires com.fasterxml.jackson.databind;
    requires mylib;

    exports com.example.api;

    opens com.example.model to
        com.fasterxml.jackson.databind;
}
```

---

## Real-World Scenarios

### Scenario 1: Spring Boot migration

// Spring Boot works on module path but needs opens directives
module com.example.myapp {
    requires spring.boot;
    requires spring.boot.autoconfigure;
    requires spring.web;
    requires spring.context;

    // Open packages for Spring reflection
    opens com.example.controller to spring.web;
    opens com.example.model to org.hibernate.orm.core;
    opens com.example.config to spring.core;
}

### Scenario 2: Handling split packages


**What this code does — step by step:**

1. Problem: two JARs both have com.example.util. JAR-A: com.example.util.StringHelper. JAR-B: com.example.util.NumberHelper
2. Solution 1: Merge into one module
3. Solution 2: Rename package in one JAR. JAR-B: com.example.numbers.NumberHelper

The same code, clean:

```java
module com.example.util {
    exports com.example.util;
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Split packages | Module system refuses to load | Merge or rename packages |
| Missing opens for reflection | InaccessibleObjectException | Add opens directive |
| Forgetting --add-opens for frameworks | Frameworks can't work | Use --add-opens as bridge |
| Modularizing too aggressively | Breaks everything | Do it incrementally |

## References

- [dev.java — the official OpenJDK site](https://dev.java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/17/language/java-module-system.htm)
