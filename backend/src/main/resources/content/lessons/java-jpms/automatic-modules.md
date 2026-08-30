---
title: Automatic Modules — Legacy JARs in the Module System
summary: What automatic modules are, how they get their names, the migration path from classpath to module path, and how organizations adopt JPMS incrementally.
order: 2
minutes: 18
topics: [automatic-modules, classpath, module-path, migration, java9]
docs:
  - https://docs.oracle.com/javase/9/language/java-module-system.htm
---

## The Concept, From Zero

Not all JARs have a `module-info.java`. The module system handles these as **automatic modules** — JARs that act like modules without explicit configuration:

```java
// A JAR without module-info.java (like most third-party libraries)
// When placed on the module path, it becomes an automatic module:
//   - Module name is derived from the JAR filename
//   - ALL packages are exported (no encapsulation)
//   - Can require other modules
```

**Automatic module naming rules:**
- `my-library-1.0.jar` → module name `my.library` (remove version, replace `-` with `.`)
- `spring-core-5.3.jar` → module name `spring.core`
- If `Automatic-Module-Name` is in MANIFEST.MF → uses that name instead

---

## Line-by-Line Walkthrough

```java
// === How automatic modules work ===

// File: my-library-1.0.jar (no module-info.java)
// On module path, becomes: module my.library

// File: module-info.java for a project using automatic modules
module com.acme.app {
    // Require an automatic module (no module-info.java)
    requires my.library;          // works! name derived from JAR filename
    requires com.google.gson;     // works! automatic module

    // Or use the Automatic-Module-Name from MANIFEST.MF
    requires spring.core;         // Spring JARs have Automatic-Module-Name

    exports com.acme.app.api;
}

// === Migration Strategy: ===

// Step 1: Start with classpath (no modules)
// java -cp lib/* com.acme.app.Main

// Step 2: Move JARs to module path (automatic modules)
// java --module-path lib/ --module com.acme.app/com.acme.app.Main

// Step 3: Add module-info.java to your own code
// Now you control what's exported

// Step 4: Gradually add requires for each dependency
// Step 5: Replace automatic modules with named modules over time
```

---

## Real-World Scenarios

### Scenario 1: Spring Boot migration

```java
// Spring Boot 3.x supports JPMS but uses automatic modules by default
// You can gradually adopt modules:

// module-info.java (optional, but recommended)
module com.acme.springboot.app {
    requires spring.boot;
    requires spring.boot.autoconfigure;
    requires spring.web;
    requires spring.context;
    requires java.sql;

    // Open packages for Spring's reflection
    opens com.acme.app to spring.core;
    opens com.acme.app.model to hibernate.orm.core, com.fasterxml.jackson.databind;
}
```

### Scenario 2: Library author adding module support

```java
// If you maintain a library, add Automatic-Module-Name to MANIFEST.MF
// pom.xml configuration:
// <plugin>
//   <groupId>org.apache.maven.plugins</groupId>
//   <artifactId>maven-jar-plugin</artifactId>
//   <configuration>
//     <archive>
//       <manifestEntries>
//         <Automatic-Module-Name>com.my.library</Automatic-Module-Name>
//       </manifestEntries>
//     </archive>
//   </configuration>
// </plugin>

// Later, add module-info.java for full module support
module com.my.library {
    exports com.my.library.api;
    exports com.my.library.model;
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `--add-modules` everywhere | Workaround, not solution | Add proper `requires` in module-info.java |
| Forgetting `opens` for reflection | Runtime errors with Spring/Jackson | Add `opens` for reflective access |
| Automatic module name conflicts | Two JARs with same derived name | Use `Automatic-Module-Name` in MANIFEST.MF |
| Not testing on module path | Classpath works but module path breaks | Test with `--module-path` during migration |
