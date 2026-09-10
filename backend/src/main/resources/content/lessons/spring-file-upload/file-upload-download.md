---
title: Spring Boot File Upload & Download
summary: MultipartFile handling, file storage strategies, download endpoints, validation, and how organizations handle file processing at scale.
order: 4
minutes: 22
topics: [file-upload, multipart, file-download, storage, spring-boot]
docs:
  - https://docs.spring.io/spring-boot/reference/web/servlet.html#web.servlet.spring-multipart.file-uploads
---

## The Concept, From Zero

Spring Boot makes file upload simple with `MultipartFile`:

```java
@PostMapping("/upload")
public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file) {
    String filename = file.getOriginalFilename();
    byte[] content = file.getBytes();
    long size = file.getSize();
    String contentType = file.getContentType();
    // Save to disk, database, or cloud storage
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Basic file upload endpoint
2. Validate file
3. Generate unique filename
4. Create directory if needed
5. Save file
6. Line 2: File upload with validation
7. `private static final long MAX_SIZE = 10 * 1024 * 1024;` — 10MB
8. Size validation
9. Type validation
10. Process file
11. Line 3: File download endpoint
12. Line 4: Multiple file upload
13. Line 5: application.yml configuration. Spring: servlet: multipart: max-file-size: 10MB. Max-request-size: 50MB. Enabled: true

The same code, clean:

```java
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.*;

@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final Path uploadDir = Paths.get("uploads");

    @PostMapping("/upload")
    public ResponseEntity<Map<String, String>> upload(
            @RequestParam("file") MultipartFile file) throws IOException {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File is empty"));
        }

        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path filePath = uploadDir.resolve(filename);

        Files.createDirectories(uploadDir);

        file.transferTo(filePath.toFile());

        return ResponseEntity.ok(Map.of(
            "filename", filename,
            "originalName", file.getOriginalFilename(),
            "size", String.valueOf(file.getSize()),
            "contentType", file.getContentType()
        ));
    }
}

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private static final long MAX_SIZE = 10 * 1024 * 1024;
    private static final Set<String> ALLOWED_TYPES = Set.of(
        "application/pdf",
        "image/jpeg",
        "image/png",
        "application/msword"
    );

    @PostMapping("/upload")
    public ResponseEntity<?> uploadDocument(
            @RequestParam("file") MultipartFile file) {

        if (file.getSize() > MAX_SIZE) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "File too large. Max: 10MB"));
        }

        if (!ALLOWED_TYPES.contains(file.getContentType())) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "File type not allowed"));
        }

        try {
            String savedPath = saveFile(file);
            return ResponseEntity.ok(Map.of("path", savedPath));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                .body(Map.of("error", "Failed to save file"));
        }
    }
}

@RestController
@RequestMapping("/api/files")
public class FileDownloadController {

    @GetMapping("/download/{filename}")
    public ResponseEntity<Resource> download(@PathVariable String filename) {
        Path filePath = Paths.get("uploads").resolve(filename);

        if (!Files.exists(filePath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new UrlResource(filePath.toUri());
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + filename + "\"")
            .body(resource);
    }
}

@PostMapping("/upload-multiple")
public ResponseEntity<List<Map<String, String>>> uploadMultiple(
        @RequestParam("files") List<MultipartFile> files) {

    List<Map<String, String>> results = new ArrayList<>();

    for (MultipartFile file : files) {
        if (!file.isEmpty()) {
            String filename = saveFile(file);
            results.add(Map.of(
                "filename", filename,
                "size", String.valueOf(file.getSize())
            ));
        }
    }

    return ResponseEntity.ok(results);
}
```

---

## Real-World Scenarios

### Scenario 1: Profile picture upload with resize

@Service
public class ProfilePictureService {

    public String uploadProfilePicture(MultipartFile file, String userId) throws IOException {
        // Validate
        validateImage(file);

        // Generate path
        String filename = "profile_" + userId + "_" + System.currentTimeMillis() + ".jpg";
        Path path = Paths.get("uploads/profiles").resolve(filename);

        // Save original
        file.transferTo(path.toFile());

        // Generate thumbnail (100x100)
        BufferedImage original = ImageIO.read(path.toFile());
        BufferedImage thumbnail = Scalr.resize(original, 100, 100);
        ImageIO.write(thumbnail, "jpg",
            Paths.get("uploads/profiles/thumb_" + filename).toFile());

        return filename;
    }
}

### Scenario 2: CSV import processing

@PostMapping("/import-csv")
public ResponseEntity<?> importCsv(@RequestParam("file") MultipartFile file) {
    if (!file.getOriginalFilename().endsWith(".csv")) {
        return ResponseEntity.badRequest().body(Map.of("error", "Not a CSV file"));
    }

    try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(file.getInputStream()))) {
        List<ImportResult> results = new ArrayList<>();
        String line;
        int rowNum = 0;

        while ((line = reader.readLine()) != null) {
            rowNum++;
            try {
                String[] fields = line.split(",");
                processRow(fields);
                results.add(new ImportResult(rowNum, "SUCCESS", null));
            } catch (Exception e) {
                results.add(new ImportResult(rowNum, "FAILED", e.getMessage()));
            }
        }

        return ResponseEntity.ok(results);
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not checking `file.isEmpty()` | NullPointerException | Always check before processing |
| Saving with original filename | Name collisions | Use UUID + original name |
| No file size limit | Disk fills up | Configure `spring.servlet.multipart.max-file-size` |
| Not validating content type | Security risk | Validate against allowed types |
| Storing files in classpath | Lost on redeploy | Use external storage |

## References

- [Learn Java Online — interactive exercises](https://www.learnjavaonline.org/)
- [docs.spring.io/spring-boot/reference/web/servlet.html](https://docs.spring.io/spring-boot/reference/web/servlet.html)
