---
title: File Upload & Download — Multipart Handling in Spring MVC
summary: MultipartFile and MultipartResolver, streaming large uploads, size limits, storage strategies, and download with Content-Disposition.
order: 7
minutes: 17
topics: [multipart, file-upload, multipartfile, streaming, size-limits, content-disposition, storage]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/multipart.html
  - https://docs.spring.io/spring-boot/reference/servlet/spring-mvc.html#servlet.spring-mvc.multipart
---

# File Upload & Download — Multipart Handling in Spring MVC

## The concept: multipart/form-data

A file upload is an HTTP request whose body is `multipart/form-data` — a sequence of **parts**, each with its own headers, carrying either a form field or a file with a filename and content type. Spring MVC parses this into `MultipartFile` instances; the `MultipartResolver` (auto-configured in Spring Boot) handles the parsing, including spooling large uploads to disk instead of memory.

```java
@PostMapping("/api/documents")
public DocumentUpload upload(@RequestParam("file") MultipartFile file,
                             @RequestParam String description) {
    // file.getOriginalFilename(), file.getSize(), file.getContentType()
    // file.getInputStream() — stream the content, don't read it all into memory
}
```

## The essential limits (configure, don't assume defaults)

Spring Boot's defaults are generous — configure them explicitly for your use case:

```properties
spring.servlet.multipart.max-file-size=10MB     # per-file cap
spring.servlet.multipart.max-request-size=15MB  # whole request (multi-file forms)
spring.servlet.multipart.file-size-threshold=2MB  # spool to disk above this instead of RAM
spring.servlet.multipart.location=             # temp dir (default: system temp)
```

The `file-size-threshold` matters: small files stay in memory; larger ones spill to disk — protecting the JVM from an upload storm of big files.

## How we use it in an organization: the scenarios

**Scenario 1 — streaming large uploads.** For big files, never call `file.getBytes()` (loads the whole thing into RAM). Stream with `transferTo` (the framework's optimized copy) or read the stream in chunks:

```java
@PostMapping("/api/videos")
public void uploadVideo(@RequestParam("file") MultipartFile file) throws IOException {
    Path dest = Path.of(uploadDir, UUID.randomUUID() + "-" + sanitize(file.getOriginalFilename()));
    file.transferTo(dest);                       // framework handles spooling/copying
}
```

**Scenario 2 — validating before storing.** Check type, size, and content *before* writing anything:

```java
private static final Set<String> ALLOWED = Set.of("image/png", "image/jpeg", "application/pdf");

if (file.isEmpty()) throw new BadRequestException("empty file");
if (file.getSize() > MAX) throw new PayloadTooLargeException("too large");
if (!ALLOWED.contains(file.getContentType())) throw new BadRequestException("unsupported type");
// remember: Content-Type is client-declared — verify magic bytes for security-sensitive uploads
```

**Scenario 3 — storing in object storage (S3-compatible) rather than local disk.** The upload streams straight to the bucket:

```java
s3.putObject(bucket, key, file.getInputStream(), s3Meta(file));
// URL = /api/files/{key} — the app serves a signed link, not the bytes
```

Production teams almost always put uploads in object storage, not the app's filesystem — the app stays stateless and horizontally scalable. Local disk is for dev and small internal tools.

**Scenario 4 — serving files with Content-Disposition.** Download endpoint that forces a filename:

```java
@GetMapping("/api/files/{id}/download")
public ResponseEntity<Resource> download(@PathVariable Long id) {
    StoredFile f = fileRepo.findById(id).orElseThrow();
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + f.originalName() + "\"")
        .contentType(MediaType.parseMediaType(f.contentType()))
        .body(new InputStreamResource(f.openStream()));
}
```

`attachment` prompts the browser to download; `inline` displays in-browser. Never trust the client filename for the *path* — generate the server-side key and keep the original name only for display.

## Multi-file uploads and progress

```java
@PostMapping("/api/photos/bulk")
public List<PhotoRef> uploadBulk(@RequestParam("files") List<MultipartFile> files) { ... }
// the "files" param name must match the repeated form field name
```

For real progress bars you need chunked upload or a signed-URL pattern (client uploads directly to storage) — a plain multipart POST can't report progress through a normal proxy chain.

## Pitfalls

- **`file.getBytes()` on huge files** — OOM under load; stream or `transferTo`.
- **Filename injection** — a client filename like `../../etc/passwd` or with path separators must be sanitized (keep only the basename; use a server-generated key for storage).
- **Missing multipart resolver** — Spring Boot auto-configures it; a custom MVC setup must declare `MultipartResolver` or uploads 400 with "no multipart boundary".
- **Limits are your friend** — without `max-file-size`, a 10GB upload streams into your temp dir; with it, the server rejects early with a clean 413.
- **Content-Type trust** — `getContentType()` is the client's claim; verify actual content (magic bytes) for anything security-relevant (images, executables, documents).
- **Temp cleanup** — spooled files live in the temp dir; ensure the OS cleans it or add a job, or you'll fill the disk.

## Key takeaways

- Multipart uploads = `MultipartFile`; configure `max-file-size`, `max-request-size`, and the memory threshold.
- Stream with `transferTo`/`getInputStream` — never `getBytes()` on large files.
- Validate size, type, and magic bytes before storing; sanitize filenames.
- Production: store in object storage; keep the app stateless.
- Serve downloads with `Content-Disposition` (attachment vs inline) and server-generated keys.
