---
title: Maven Plugins in Practice
module: maven-gradle
order: 3
minutes: 20
topics: ["plugin configuration", "compiler", "surefire", "failsafe", "checkstyle", "code coverage", "spotless"]
docs:
  - title: "Maven plugins"
    url: "https://maven.apache.org/plugins/index.html"
---

# Maven Plugins in Practice

The lifecycle is the skeleton; plugins are the organs. This lesson covers the plugins every Spring project actually uses — compiler, surefire/failsafe for tests, and the quality gates (checkstyle, spotbugs, Jacoco, spotless) that make `mvn verify` mean something.

## The Compiler Plugin

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <release>21</release>          <!-- target language level -->
        <parameters>true</parameters>  <!-- keep parameter names (Spring needs them) -->
    </configuration>
</plugin>
```

`<parameters>true</parameters>` matters for Spring: without parameter names, `@RequestParam`/`@PathVariable` binding can break and constructors must be annotated.

## Surefire: Unit Tests

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <includes>
            <include>**/*Test.java</include>
            <include>**/*Tests.java</include>
        </includes>
        <excludedGroups>integration</excludedGroups>
        <parallel>methods</parallel>
        <threadCount>4</threadCount>
    </configuration>
</plugin>
```

Surefire runs `*Test.java` in the `test` phase. Reports land in `target/surefire-reports/` — CI reads them for pass/fail.

## Failsafe: Integration Tests

Surefire runs fast unit tests; **Failsafe** runs `*IT.java` (integration tests) in `verify` — after packaging:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-failsafe-plugin</artifactId>
    <executions>
        <execution>
            <goals><goal>integration-test</goal><goal>verify</goal></goals>
        </execution>
    </executions>
    <configuration>
        <includes><include>**/*IT.java</include></includes>
    </configuration>
</plugin>
```

The split matters: `mvn test` runs fast unit tests (every commit); `mvn verify` runs the full suite including integration tests (before merge).

## Jacoco: Coverage Gate

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <configuration>
        <excludes>
            <exclude>**/config/**</exclude>
            <exclude>**/*Application.class</exclude>
        </excludes>
    </configuration>
    <executions>
        <execution>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>check</id>
            <goals><goal>check</goal></goals>
            <configuration>
                <rules>
                    <rule>
                        <element>BUNDLE</element>
                        <limits>
                            <limit>
                                <counter>LINE</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.70</minimum>
                            </limit>
                        </limits>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

`mvn verify` now **fails the build** under 70% line coverage. The gate is the enforcement — without it, coverage reports are decoration.

## Checkstyle: Style Enforcement

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-checkstyle-plugin</artifactId>
    <configuration>
        <configLocation>google_checks.xml</configLocation>
        <failOnViolation>true</failOnViolation>
        <consoleOutput>true</consoleOutput>
    </configuration>
    <executions>
        <execution>
            <phase>validate</phase>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

Enforces naming, import order, line length at the `validate` phase — before compilation.

## Spotless: Formatting

Spotless formats *and* checks — the "git diff stays clean" plugin:

```xml
<plugin>
    <groupId>com.diffplug.spotless</groupId>
    <artifactId>spotless-maven-plugin</artifactId>
    <configuration>
        <java>
            <googleJavaFormat>
                <version>1.22.0</version>
                <style>GOOGLE</style>
            </googleJavaFormat>
            <removeUnusedImports/>
        </java>
    </configuration>
</plugin>
```

```bash
mvn spotless:apply    # format everything
mvn spotless:check    # fail if not formatted (CI)
```

## SpotBugs/PMD: Static Analysis

```xml
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <configuration>
        <effort>Max</effort>
        <threshold>High</threshold>
        <failOnError>true</failOnError>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

Catches real bugs the compiler can't: null dereference patterns, resource leaks, bad `equals` implementations.

## The Quality-Gate Pipeline

```bash
mvn verify
# validate:  checkstyle
# compile:   compiler
# test:      surefire (+ jacoco coverage measured)
# verify:    failsafe integration tests + jacoco check + spotbugs
```

`verify` is the merge gate: style, coverage, static analysis, and tests — all enforced by the build, all visible in CI.

## Custom Plugin Configuration Patterns

```xml
<!-- Property-driven configuration (overridable via -D) -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <skipTests>${skip.unit.tests}</skipTests>
    </configuration>
</plugin>
```

```bash
mvn verify -Dskip.unit.tests=true   # per-run override
```

## Summary

| Concern | Plugin |
|---------|--------|
| Compile | maven-compiler-plugin (`release`, `parameters`) |
| Unit tests | surefire (`*Test.java`, test phase) |
| Integration tests | failsafe (`*IT.java`, verify phase) |
| Coverage | jacoco (measure + gate) |
| Style | checkstyle |
| Formatting | spotless (apply + check) |
| Static analysis | spotbugs / PMD |

`mvn verify` with quality gates is the difference between "the build passes" and "the build is trustworthy": tests prove behavior, coverage proves the tests touched the code, checkstyle/spotless keep it readable, and spotbugs catches what tests miss. Configure them once, enforce them in CI, and let the build be the gatekeeper.
