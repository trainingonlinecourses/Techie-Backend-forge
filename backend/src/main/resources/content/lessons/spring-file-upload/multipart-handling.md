---
title: Multipart File Upload — Handling File Submissions
summary: How Spring Boot handles multipart uploads, MultipartFile API, configuration limits, storage strategies, and controller patterns for file handling.
order: 2
minutes: 20
topics: [multipart, file-upload, MultipartFile, storage, limits, controller]
docs:
  - https://docs.spring.io/spring-boot/reference/web/servlet.html#web.servlet.spring-mvc.multipart-file-uploads
---

## The Concept, From Zero

Multipart is the HTTP standard for uploading files. Spring Boot wraps the raw multipart data in `MultipartFile` objects that are easy to work with.

```java
@PostMapping("/upload")
public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file) {
    String name = file.getOriginalFilename();
    long size = file.getSize();
    byte[] bytes = file.getBytes();
    return ResponseEntity.ok("Uploaded: " + name + " (" + size + " bytes)");
}
```

---

## Configuration

```yaml
# application.yml
spring:
  servlet:
    multipart:
      enabled: true
      max-file-size: 10MB        # max single file size
      max-request-size: 50MB     # max total request size
      file-size-threshold: 2KB   # when to write to disk vs memory
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.io.*;
import java.nio.file.*;

@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final Path uploadDir = Paths.get("./uploads");

    // 1. Single file upload
    @PostMapping("/single")
    public ResponseEntity<?> uploadSingle(
            @RequestParam("file") MultipartFile file) throws IOException {

        // Validate
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("File is empty");
        }

        // Save to disk
        String filename = System.currentTimeMillis() + "_" + file.getOriginalFilename();
        Path target = uploadDir.resolve(filename);
        Files.createDirectories(uploadDir);
        file.transferTo(target.toFile());

        return ResponseEntity.ok(Map.of(
            "filename", filename,
            "size", file.getSize(),
            "contentType", file.getContentType()
        ));
    }

    // 2. Multiple file upload
    @PostMapping("/multiple")
    public ResponseEntity<?> uploadMultiple(
            @RequestParam("files") MultipartFile[] files) throws IOException {

        List<String> saved = new ArrayList<>();
        for (MultipartFile file : files) {
            if (!file.isEmpty()) {
                String filename = System.currentTimeMillis() + "_" + file.getOriginalFilename();
                file.transferTo(uploadDir.resolve(filename).toFile());
                saved.add(filename);
            }
        }
        return ResponseEntity.ok(Map.of("uploaded", saved));
    }

    // 3. Form data with file + metadata
    @PostMapping("/document")
    public ResponseEntity<?> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String desc) throws IOException {

        // Process metadata + file together
        String filename = saveFile(file);
        return ResponseEntity.ok(Map.of(
            "id", filename,
            "title", title,
            "description", desc != null ? desc : ""
        ));
    }

    private String saveFile(MultipartFile file) throws IOException {
        String filename = System.currentTimeMillis() + "_" + file.getOriginalFilename();
        file.transferTo(uploadDir.resolve(filename).toFile());
        return filename;
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Image upload with validation

```java
@PostMapping("/avatar")
public ResponseEntity<?> uploadAvatar(@RequestParam("file") MultipartFile file) {
    // Validate file type
    String contentType = file.getContentType();
    if (!Set.of("image/jpeg", "image/png", "image/webp").contains(contentType)) {
        return ResponseEntity.badRequest().body("Only JPEG/PNG/WebP allowed");
    }

    // Validate size
    if (file.getSize() > 5 * 1024 * 1024) {
        return ResponseEntity.badRequest().body("Max 5MB");
    }

    // Save with safe filename
    String ext = switch (contentType) {
        case "image/jpeg" -> ".jpg";
        case "image/png" -> ".png";
        case "image/webp" -> ".webp";
        default -> ".bin";
    };
    String filename = UUID.randomUUID() + ext;
    // ... save to storage
    return ResponseEntity.ok(Map.of("filename", filename));
}
```

### Scenario 2: Streaming large files

```java
@PostMapping("/large")
public ResponseEntity<?> uploadLarge(@RequestParam("file") MultipartFile file) throws IOException {
    // Don't load entire file into memory
    try (InputStream in = file.getInputStream();
         OutputStream out = Files.newOutputStream(uploadDir.resolve("large-file"))) {
        in.transferTo(out);  // streaming, not buffered
    }
    return ResponseEntity.ok("Uploaded");
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `@RequestParam("file")` name | 400 error — param mismatch | Match the HTML form field name |
| Loading huge files into memory | OutOfMemoryError | Use streaming or temp files |
| Not validating file type | Security risk — could upload executable | Validate MIME type + extension |
| Using original filename directly | Path traversal attacks | Use UUID-based filenames |
