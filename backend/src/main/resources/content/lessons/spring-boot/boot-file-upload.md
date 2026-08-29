---
title: File Upload and Download — Multipart, Storage, and Streaming
summary: MultipartFile handling, file size limits, streaming large files to S3/local disk, download with Content-Disposition, and how organizations handle file uploads safely without running out of memory.
order: 32
minutes: 20
topics: [multipart, file-upload, file-download, multipartfile, content-disposition, streaming-upload, file-storage]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet.spring-mvc.file-uploading
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-multipart.html
---

# File Upload and Download — Multipart, Storage, and Streaming

## The concept

File uploads use **multipart/form-data** encoding — the browser wraps the file content in a boundary-delimited MIME message and sends it as a POST body. Spring's `MultipartFile` abstraction gives you a clean API to receive, inspect, and store the file.

**The critical pitfall:** by default, Spring buffers the entire uploaded file in memory. A 2GB upload fills 2GB of heap. The fix: configure a size threshold above which Spring writes to a temp file on disk.

```yaml
# application.yml
spring:
  servlet:
    multipart:
      enabled: true
      max-file-size: 10MB        # max single file size
      max-request-size: 50MB     # max total request size
      file-size-threshold: 2KB   # write to disk above this (default: 0 = always disk)
```

## Upload: controller and service

```java
@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final FileStorageService storageService;

    public FileUploadController(FileStorageService storageService) {
        this.storageService = storageService;
    }

    @PostMapping("/upload")
    public ResponseEntity<FileMetadata> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "general") String category) {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        FileMetadata metadata = storageService.store(file, category);
        return ResponseEntity.ok(metadata);
    }
}
```

```java
@Service
public class FileStorageService {

    private final Path storageRoot;

    public FileStorageService(@Value("${app.storage.root:/data/uploads}") String root) {
        this.storageRoot = Path.of(root);
        try { Files.createDirectories(storageRoot); }
        catch (IOException e) { throw new UncheckedIOException(e); }
    }

    public FileMetadata store(MultipartFile file, String category) {
        String filename = UUID.randomUUID() + getExtension(file.getOriginalFilename());
        Path target = storageRoot.resolve(category).resolve(filename);

        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target.toFile());  // uses temp file if above threshold
        } catch (IOException e) {
            throw new StorageException("Failed to store file", e);
        }

        return new FileMetadata(filename, file.getContentType(), file.getSize(), category);
    }
}
```

## Download: streaming with Content-Disposition

```java
@GetMapping("/download/{category}/{filename}")
public ResponseEntity<Resource> download(
        @PathVariable String category,
        @PathVariable String filename) {

    Path filePath = storageRoot.resolve(category).resolve(filename);

    if (!Files.exists(filePath)) {
        return ResponseEntity.notFound().build();
    }

    Resource resource = new FileSystemResource(filePath.toFile());

    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"" + filename + "\"")
        .body(resource);
}
```

## Upload to S3 — streaming without buffering the entire file

```java
@Service
public class S3FileStorageService {

    private final S3Client s3;
    private final String bucket;

    public S3FileStorageService(S3Client s3, @Value("${aws.s3.bucket}") String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    public String store(MultipartFile file, String key) {
        try {
            // Stream directly from the multipart input stream to S3
            // No in-memory buffer of the entire file
            PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(file.getContentType())
                .build();

            s3.putObject(request,
                RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

            return "https://" + bucket + ".s3.amazonaws.com/" + key;

        } catch (IOException e) {
            throw new StorageException("S3 upload failed", e);
        }
    }
}
```

`RequestBody.fromInputStream()` streams directly to S3 without buffering the full file. The `file.getSize()` lets S3 set the `Content-Length` header.

## Client-side upload with progress (AJAX)

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('category', 'documents');

fetch('/api/files/upload', {
    method: 'POST',
    body: formData  // browser sets Content-Type: multipart/form-data automatically
}).then(r => r.json())
  .then(meta => console.log('Uploaded:', meta.filename));
```

## How we use it in organizations

### Scenario 1: profile picture upload with validation

```java
@PostMapping("/profile/picture")
public ResponseEntity<Void> uploadProfilePicture(
        @RequestParam("file") MultipartFile file) {

    // Validate before storing
    if (file.getSize() > 5 * 1024 * 1024) {
        throw new BadRequestException("File too large (max 5MB)");
    }

    String contentType = file.getContentType();
    if (!Set.of("image/jpeg", "image/png", "image/webp").contains(contentType)) {
        throw new BadRequestException("Only JPEG, PNG, and WebP allowed");
    }

    storageService.store(file, "profile-pictures");
    return ResponseEntity.ok().build();
}
```

### Scenario 2: bulk CSV import with streaming

```java
@PostMapping("/import/orders")
public ResponseEntity<ImportResult> importOrders(@RequestParam("file") MultipartFile file) {
    if (!"text/csv".equals(file.getContentType())) {
        throw new BadRequestException("CSV file required");
    }

    // Stream line by line — never load entire file into memory
    try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

        ImportResult result = reader.lines()
            .skip(1)  // skip header
            .map(this::parseOrderLine)
            .filter(Objects::nonNull)
            .map(orderService::createOrder)
            .collect(ImportResult::new, ImportResult::addSuccess, ImportResult::merge);

        return ResponseEntity.ok(result);
    }
}
```

### Scenario 3: presigned URL for direct client-to-S3 upload

```java
@PostMapping("/presigned-url")
public ResponseEntity<PresignedUrl> getPresignedUploadUrl(
        @RequestParam String filename,
        @RequestParam String contentType) {

    String key = "uploads/" + UUID.randomUUID() + "/" + filename;

    PutObjectRequest request = PutObjectRequest.builder()
        .bucket(bucket)
        .key(key)
        .contentType(contentType)
        .build();

    PresignedPutObjectRequest presigned = presigner.presignPutObject(request);

    return ResponseEntity.ok(new PresignedUrl(
        presigned.url().toString(),
        key,
        presigned.expiration().toEpochMilli()
    ));
}
```

The client uploads directly to S3 using the presigned URL — the file never touches your server.

## Security considerations

| Risk | Mitigation |
|---|---|
| Path traversal (`../../etc/passwd`) | Sanitize filenames, use UUID naming |
| Malicious file types | Validate `Content-Type` + magic bytes |
| Disk exhaustion | Set max file size, monitor disk usage |
| File upload DoS | Rate-limit upload endpoint, set request size |
| Serving uploaded files | Never serve from webroot; use a controller with auth |

## Common mistakes

| Mistake | Consequence |
|---|---|
| No file size limit | OOM on large uploads |
| Trusting `getOriginalFilename()` | Path traversal attacks |
| Storing files in webroot | Security bypass, accidental deletion on redeploy |
| Reading entire file into `byte[]` | OOM for large files |
| Not checking `file.isEmpty()` | Stores empty files |
