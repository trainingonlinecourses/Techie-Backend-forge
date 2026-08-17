---
title: Resources & ResourceLoader
summary: Abstracting files, classpath entries and URLs behind Spring's Resource interface — ResourceLoader injection, patterns, and reading resources in Boot apps.
order: 13
minutes: 12
topics: [resource, resourceloader, classpath, files, resource patterns]
docs:
  - https://docs.spring.io/spring-framework/reference/core/resources.html
---

# Resources & ResourceLoader

## The problem

`new File("config.json")` hard-codes a *filesystem* path — but the same artifact must read from the classpath in a jar, from a URL in the cloud, and from disk in tests. Spring abstracts all of them behind one interface: **`Resource`**.

```java
Resource r = new ClassPathResource("data/seed.json");   // classpath:...
Resource r = new FileSystemResource("/etc/app/conf");    // file:...
Resource r = new UrlResource("https://example.com/x");   // https:...
```

## Prefixes decide the source

| Prefix | Meaning |
|---|---|
| `classpath:` | resource on the classpath (inside the jar) |
| `file:` | filesystem path |
| `https:` / `http:` | remote URL |
| *(none)* | depends on the `ResourceLoader` (usually classpath) |

Spring Boot lets you reference any of these directly in configuration:

```yaml
app:
  banner-file: classpath:banner.txt
  license: file:/etc/app/license.txt
```

Injected fields get the right `Resource` automatically — Boot's `Binder` converts the string.

## ResourceLoader injection

Spring beans get a `ResourceLoader` (the `ApplicationContext` implements it) that resolves location strings at runtime:

```java
@Service
public class TemplateService {
    private final ResourceLoader loader;

    public TemplateService(ResourceLoader loader) { this.loader = loader; }

    public String load(String location) {
        Resource r = loader.getResource(location);          // any prefix works
        return r.exists() && r.isReadable()
            ? new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
            : null;
    }
}
```

`Resource.getInputStream()` is the universal read path — `getFile()` only works for real filesystem resources, so prefer the stream (it works inside jars, too).

## Classpath patterns

`PathMatchingResourcePatternResolver` resolves **ant-style patterns** — this is how Spring finds component classes and how Boot scans configs:

```java
Resource[] r = new PathMatchingResourcePatternResolver().getResources("classpath:content/lessons/*/*.md");
```

Patterns: `*` (one path segment), `**` (any depth), `?` (one char), `{a,b}` (alternatives).

## Resources in Spring Boot

- **`application.yml` overrides**: `spring.config.import: optional:file:./conf/extra.yml` pulls config from outside the jar — the standard way to inject secrets at deploy time.
- **Reading bundled content**: `ClassPathResource("content/modules.json").getInputStream()` — how the content seed loader in this academy works.
- **`@Value("classpath:...")`** injects a `Resource` directly:

```java
@Value("classpath:data/terms.txt")
Resource terms;
```

## Resource vs. filesystem discipline

- Always read through **`getInputStream()`**, never `getFile()` — the former works in jars, classpaths and remote URLs alike.
- Check `exists()` / `isReadable()` and treat missing resources as a *configuration error* at startup, not a null check mid-request.
- For **large or streaming** content, `Resource` also supports `getContentLength()` and (via `ResourceRegion`) ranged reads for serving files.

## Key takeaways

- `Resource` = one interface for files, classpath entries, and URLs; prefixes (`classpath:`, `file:`) choose the source.
- Inject `ResourceLoader` and resolve strings at runtime, or `@Value("classpath:...")` for known paths.
- Always read via `getInputStream()`; use `PathMatchingResourcePatternResolver` for wildcards.
- External config (`spring.config.import`) is the production pattern for files that must live outside the jar.

Official docs: [Spring Resources](https://docs.spring.io/spring-framework/reference/core/resources.html)
