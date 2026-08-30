---
title: Testing Module Systems — Strategies and Tools
summary: How to test JPMS modules, module path testing, --add-reads for test access, and verifying module boundaries with jdeps.
order: 5
minutes: 15
topics: [module-testing, jdeps, module-path, add-reads, module-boundaries]
docs:
  - https://docs.oracle.com/en/java/javase/17/jtools/jdeps.html
---

## The Concept, From Zero

Testing modules means verifying that exports, requires, and opens directives are correct. Tools like `jdeps` analyze module dependencies, and test frameworks need special handling to access internal APIs.

```bash
# Analyze module dependencies
jdeps --module-path libs/ --check com.example.myapp

# Find split packages
jdeps --multi-release 17 --check mylib.jar
```

---

## Line-by-Line Walkthrough

```java
// 1. Test module access
// Test code needs --add-reads to access internal module APIs
// In your test's module-info.java:
module com.example.myapp.test {
    requires com.example.myapp;
    requires org.junit.jupiter.api;

    // Allow test to read internal packages
    opens com.example.internal to org.junit.jupiter.api;
}

// 2. jdeps analysis
// $ jdeps --module-path target/classes --check target/classes
// Shows missing requires, split packages, illegal accesses

// 3. Verify module descriptors
// $ jdeps --module-descriptor target/classes/module-info.class

// 4. Run tests on module path
// $ java --module-path target/test-classes:target/classes \
//        --add-modules org.junit.jupiter.api \
//        -m com.example.myapp.test/com.example.TestRunner
```

---

## Real-World Scenarios

### Scenario 1: Verify no illegal access

```bash
# Run with strict module checking
java --module-path libs/ \
     --illegal-access=deny \
     -m com.example.myapp/com.example.Main

# If you see IllegalAccessError, you need to add opens directives
```

### Scenario 2: jdeps in CI

```yaml
# GitHub Actions
- name: Check module dependencies
  run: |
    jdeps --module-path $JAVA_HOME/jmods:target/classes \
          --check target/classes

- name: Find split packages
  run: |
    for jar in libs/*.jar; do
      jdeps --multi-release 17 --check $jar
    done
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Running tests on classpath when code is on module path | Inconsistent test results | Use module path for tests too |
| Not using jdeps | Undetected module boundary violations | Add jdeps check to CI |
| Forgetting --add-reads for test modules | Test can't access production code | Add requires and --add-reads |
| Ignoring split package warnings | Runtime failures | Fix before deploying |
