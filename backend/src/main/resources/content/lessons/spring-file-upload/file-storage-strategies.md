---
title: File Storage Strategies — Local, S3, and Cloud
summary: Comparing local disk, S3-compatible, and database storage, implementing a storage abstraction, and choosing the right strategy for your app.
order: 3
minutes: 20
topics: [storage, local-disk, s3, cloud-storage, abstraction, blob-store]
docs:
  - https://docs.spring.io/spring-boot/reference/features/io.html
---

## The Concept, From Zero

Where you store uploaded files depends on your deployment. Local disk is simplest, but cloud storage (S3, GCS, Azure Blob) is needed for production apps with multiple instances.

```java
// Storage interface
public interface FileStorage {
    String store(MultipartFile file) throws IOException;
    byte[] load(String filename) throws IOException;
    void delete(String filename) throws IOException;
}

// Local disk implementation
@Component
@Profile("dev")
public class LocalFileStorage implements FileStorage { ... }

// S3 implementation
@Component
@Profile("prod")
public class S3FileStorage implements FileStorage { ... }
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.core.sync.PutObjectRequest;
import java.io.*;
import java.nio.file.*;

// Storage interface
public interface FileStorage {
    String store(MultipartFile file) throws IOException;
    byte[] load(String filename) throws IOException;
    void delete(String filename) throws IOException;
}

// Local implementation
@Component
@Profile("dev")
public class LocalFileStorage implements FileStorage {
    private final Path root = Paths.get("./uploads");

    @PostConstruct
    void init() throws IOException { Files.createDirectories(root); }

    @Override
    public String store(MultipartFile file) throws IOException {
        String name = UUID.randomUUID() + "_" + file.getOriginalFilename();
        file.transferTo(root.resolve(name).toFile());
        return name;
    }

    @Override
    public byte[] load(String filename) throws IOException {
        return Files.readAllBytes(root.resolve(filename));
    }

    @Override
    public void delete(String filename) throws IOException {
        Files.deleteIfExists(root.resolve(filename));
    }
}

// S3 implementation
@Component
@Profile("prod")
public class S3FileStorage implements FileStorage {
    private final S3Client s3;
    private final String bucket;

    public S3FileStorage(S3Client s3, @Value("${app.s3.bucket}") String bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }

    @Override
    public String store(MultipartFile file) throws IOException {
        String key = UUID.randomUUID() + "_" + file.getOriginalFilename();
        s3.putObject(
            PutObjectRequest.builder().bucket(bucket).key(key).build(),
            software.amazon.awssdk.core.sync.RequestBody.fromInputStream(
                file.getInputStream(), file.getSize()
            )
        );
        return key;
    }

    @Override
    public byte[] load(String filename) throws IOException {
        return s3.getObjectAsBytes(
            software.amazon.awssdk.services.s3.model.GetObjectRequest.builder()
                .bucket(bucket).key(filename).build()
        ).asByteArray();
    }

    @Override
    public void delete(String filename) {
        s3.deleteObject(
            software.amazon.awssdk.services.s3.model.DeleteObjectRequest.builder()
                .bucket(bucket).key(filename).build()
        );
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Database storage for small files

```java
@Entity
public class Attachment {
    @Id @GeneratedValue
    private Long id;
    private String filename;
    private String contentType;
    @Lob
    private byte[] data;  // max ~16MB on most databases
}
```

### Scenario 2: Multi-tenant storage

```java
@Component
public class TenantFileStorage implements FileStorage {
    private final Map<String, FileStorage> storages;

    public FileStorage forTenant(String tenantId) {
        return storages.getOrDefault(tenantId, storages.get("default"));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Storing files in database for large uploads | Performance + size limits | Use S3 for large files |
| Not using streaming for large files | Memory exhaustion | Use InputStream, not byte[] |
| Hardcoding storage path | Breaks in production | Use configurable path or S3 |
| Not handling cleanup on delete | Orphaned files accumulate | Implement lifecycle policies |
