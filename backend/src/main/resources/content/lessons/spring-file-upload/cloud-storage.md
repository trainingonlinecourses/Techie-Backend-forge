---
title: Cloud Storage Integration — S3, GCS, and Azure Blob
summary: Integrating cloud storage with Spring Boot, AWS S3 setup, pre-signed URLs, multipart upload for large files, and cost optimization.
order: 4
minutes: 20
topics: [s3, cloud-storage, pre-signed-urls, multipart-upload, aws, gcs]
docs:
  - https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
---

## The Concept, From Zero

Cloud object stores (S3, GCS, Azure Blob) handle file storage at scale — unlimited capacity, built-in redundancy, and CDN integration. Spring Boot integrates via AWS SDK or Spring Cloud GCP.

```java
// AWS S3 via Spring Cloud AWS
@Autowired
private S3Client s3;

// Upload
s3.putObject(PutObjectRequest.builder()
    .bucket("my-bucket")
    .key("uploads/file.pdf")
    .build(),
    RequestBody.fromFile(new File("file.pdf"))
);
```

---

## Pre-Signed URLs

Let users upload/download directly to S3 without going through your server:

```java
// Generate pre-signed upload URL (expires in 10 minutes)
PresignedPutObjectRequest presigned = s3Presigner.presignPutObject(
    PresignedPutObjectRequest.builder()
        .signatureDuration(Duration.ofMinutes(10))
        .putObjectRequest(PutObjectRequest.builder()
            .bucket(bucket)
            .key("uploads/" + filename)
            .build())
        .build()
);

return presigned.url().toString();
```

---

## Line-by-Line Walkthrough

```java
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.time.Duration;

@Service
public class CloudStorageService {

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;

    public CloudStorageService(S3Client s3, S3Presigner presigner,
                                @Value("${app.s3.bucket}") String bucket) {
        this.s3 = s3;
        this.presigner = presigner;
        this.bucket = bucket;
    }

    // Upload file
    public String upload(String key, java.io.InputStream data, long size) {
        s3.putObject(
            PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build(),
            RequestBody.fromInputStream(data, size)
        );
        return key;
    }

    // Generate pre-signed download URL
    public String getDownloadUrl(String key, Duration expiry) {
        GetObjectRequest getReq = GetObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .build();

        PresignedGetObjectRequest presigned = presigner.presignGetObject(
            PresignedGetObjectRequest.builder()
                .signatureDuration(expiry)
                .getObjectRequest(getReq)
                .build()
        );
        return presigned.url().toString();
    }

    // Generate pre-signed upload URL
    public String getUploadUrl(String key, Duration expiry) {
        PutObjectRequest putReq = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .build();

        PresignedPutObjectRequest presigned = presigner.presignPutObject(
            PresignedPutObjectRequest.builder()
                .signatureDuration(expiry)
                .putObjectRequest(putReq)
                .build()
        );
        return presigned.url().toString();
    }

    // Delete file
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .build());
    }

    // List files with prefix
    public List<String> list(String prefix) {
        return s3.listObjectsV2(ListObjectsV2Request.builder()
            .bucket(bucket)
            .prefix(prefix)
            .build())
            .contents()
            .stream()
            .map(S3Object::key)
            .toList();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Pre-signed upload from frontend

```java
@GetMapping("/upload-url")
public ResponseEntity<Map<String, String>> getUploadUrl(@RequestParam String filename) {
    String key = "uploads/" + UUID.randomUUID() + "_" + filename;
    String url = cloudStorage.getUploadUrl(key, Duration.ofMinutes(10));
    return ResponseEntity.ok(Map.of("uploadUrl", url, "key", key));
}
```

### Scenario 2: Streaming download

```java
@GetMapping("/download/{key}")
public void download(@PathVariable String key, HttpServletResponse response) throws IOException {
    response.setContentType("application/octet-stream");
    response.setHeader("Content-Disposition", "attachment; filename=\"" + key + "\"");

    try (var s3Stream = s3.getObject(GetObjectRequest.builder()
            .bucket(bucket).key(key).build())) {
        s3Stream.transferTo(response.getOutputStream());
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Hardcoding AWS credentials | Security risk | Use IAM roles or env vars |
| Not using pre-signed URLs | Server becomes bottleneck | Let clients upload directly to S3 |
| Not setting Content-Type | Files download incorrectly | Set contentType on upload |
| Ignoring lifecycle policies | Storage costs grow forever | Set expiration rules |
