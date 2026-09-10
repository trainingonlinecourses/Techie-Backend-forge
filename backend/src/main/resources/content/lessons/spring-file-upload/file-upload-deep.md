---
title: "File Upload & Download — Handling Binary Data in REST APIs"
summary: "MultipartFile handling, storage strategies (local vs S3), streaming large files, virus scanning, and how organizations manage file uploads at scale."
order: 3
minutes: 20
topics: [file-upload, multipart, multipartfile, s3-upload, file-storage, streaming-download]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/howto.html#howto.servlets.file-upload
  - https://spring.io/guides/gs/uploading-files
---

## The Concept, From Zero

### What is File Upload?

**File upload = sending a file from the client (browser) to the server.** When you attach a photo to an email or upload a document to Google Drive, that's file upload.

In Spring Boot, file upload uses `MultipartFile`:


**What this code does — step by step:**

1. file.getOriginalFilename() — "photo.jpg". File.getContentType() — "image/jpeg". File.getSize() — 1048576 (1MB). File.getBytes() — the actual file content. File.getInputStream() — streaming access

The same code, clean:

```java
@RestController
@RequestMapping("/api/files")
public class FileController {

    @PostMapping("/upload")
    public ResponseEntity<String> upload(@RequestParam("file") MultipartFile file) {

        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path targetPath = Paths.get("uploads/" + filename);
        Files.copy(file.getInputStream(), targetPath);

        return ResponseEntity.ok("Uploaded: " + filename);
    }
}
```

### File Upload Configuration

```properties
# application.properties
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=50MB
spring.servlet.multipart.file-size-threshold=2KB
# ↑ Files smaller than 2KB are kept in memory
# ↑ Larger files are written to temp directory
```

### Storage Strategies

**Option 1: Local filesystem (dev/simple apps)**
@Service
public class LocalFileStorage implements FileStorageService {
    private final Path uploadDir = Paths.get("uploads");
    
    public String store(MultipartFile file) {
        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Files.copy(file.getInputStream(), uploadDir.resolve(filename));
        return filename;
    }
}

**Option 2: AWS S3 (production)**
@Service
public class S3FileStorage implements FileStorageService {
    private final AmazonS3 s3Client;
    
    public String store(MultipartFile file) {
        String key = UUID.randomUUID() + "/" + file.getOriginalFilename();
        s3Client.putObject(bucketName, key, file.getInputStream(), 
            ObjectMetadata.builder()
                .contentType(file.getContentType())
                .build());
        return key;
    }
}

### Secure Upload — Prevent Attacks


**What this code does — step by step:**

1. `private static final long MAX_SIZE = 10 * 1024 * 1024;` — 10MB
2. 1. Check content type
3. 2. Check file size
4. 3. Sanitize filename
5. 4. Store safely

The same code, clean:

```java
@RestController
public class SecureFileController {

    private static final Set<String> ALLOWED_TYPES = Set.of(
        "image/jpeg", "image/png", "application/pdf"
    );

    private static final long MAX_SIZE = 10 * 1024 * 1024;

    @PostMapping("/upload")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file) {
        if (!ALLOWED_TYPES.contains(file.getContentType())) {
            return ResponseEntity.badRequest().body("Invalid file type");
        }

        if (file.getSize() > MAX_SIZE) {
            return ResponseEntity.badRequest().body("File too large");
        }

        String filename = StringUtils.cleanPath(
            Objects.requireNonNull(file.getOriginalFilename()));
        if (filename.contains("..")) {
            return ResponseEntity.badRequest().body("Invalid filename");
        }

        String storedName = fileStorageService.store(file);
        return ResponseEntity.ok(Map.of("filename", storedName));
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No file size limit | Memory exhaustion, DoS | Set max-file-size |
| No content type validation | Malicious file uploads | Validate allowed types |
| Using original filename | Path traversal attacks | Sanitize with UUID prefix |
| Reading entire file into memory | OOM for large files | Use InputStream streaming |
| No virus scanning | Malware in uploads | Scan before processing |

### Key Takeaways

1. **Always limit file size** — prevent memory exhaustion
2. **Validate content types** — don't trust client-provided MIME types
3. **Use UUID in filenames** — prevent path traversal and overwrites
4. **Stream large files** — don't read entire file into memory
5. **Store files externally** — S3 or cloud storage for production
6. **Scan for malware** — integrate virus scanning before processing

### Real-World Organization Scenario

A document management platform handles 10,000 file uploads/day. They use multipart upload to S3, virus scanning via ClamAV, and streaming downloads. Each upload: validates type → scans virus → stores in S3 → creates metadata record. Downloads stream directly from S3 without loading into server memory. The system handles files up to 100MB without issues.

## References

- [Learn Java Online — interactive exercises](https://www.learnjavaonline.org/)
- [docs.spring.io/spring-boot/reference/web/servlet.html](https://docs.spring.io/spring-boot/reference/web/servlet.html)
