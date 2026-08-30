---
title: Streaming Downloads — Serving Files Efficiently
summary: How to serve files as downloads, streaming large files without buffering in memory, Content-Disposition headers, and range requests for partial downloads.
order: 5
minutes: 15
topics: [streaming, download, content-disposition, range-requests, large-files]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-responseentity.html
---

## The Concept, From Zero

Streaming downloads send file data directly from source to client without loading the entire file into memory. This is essential for large files.

```java
@GetMapping("/download/{id}")
public ResponseEntity<Resource> download(@PathVariable Long id) {
    Resource resource = new FileSystemResource(file);
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
        .body(resource);
}
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;
import java.io.*;

@RestController
@RequestMapping("/api/files")
public class DownloadController {

    private final Path storageDir = Paths.get("./uploads");

    // 1. Simple download with ResponseEntity
    @GetMapping("/download/{filename}")
    public ResponseEntity<Resource> download(@PathVariable String filename) {
        Path file = storageDir.resolve(filename);
        if (!Files.exists(file)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(file);

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .contentLength(Files.size(file))
            .body(resource);
    }

    // 2. Streaming with ResponseBodyEmitter (for large files)
    @GetMapping("/stream/{filename}")
    public void streamDownload(@PathVariable String filename,
                               HttpServletResponse response) throws IOException {
        Path file = storageDir.resolve(filename);
        response.setContentType("application/octet-stream");
        response.setHeader("Content-Disposition",
                           "attachment; filename=\"" + filename + "\"");
        response.setContentLengthLong(Files.size(file));

        try (InputStream in = Files.newInputStream(file);
             OutputStream out = response.getOutputStream()) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
                out.flush();
            }
        }
    }

    // 3. Range request support (partial downloads)
    @GetMapping("/range/{filename}")
    public ResponseEntity<Resource> rangeDownload(
            @PathVariable String filename,
            @RequestHeader(value = "Range", required = false) String range) {

        Path file = storageDir.resolve(filename);
        if (!Files.exists(file)) {
            return ResponseEntity.notFound().build();
        }

        if (range != null) {
            // Parse range header: "bytes=0-1023"
            long start = 0;
            long end = Files.size(file) - 1;
            String[] parts = range.replace("bytes=", "").split("-");
            start = Long.parseLong(parts[0]);
            if (parts.length > 1) end = Long.parseLong(parts[1]);

            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.CONTENT_RANGE,
                        "bytes " + start + "-" + end + "/" + Files.size(file))
                .contentLength(end - start + 1)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new FileSystemResource(file));
        }

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .contentLength(Files.size(file))
            .body(new FileSystemResource(file));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Loading entire file into memory | OutOfMemoryError for large files | Use streaming or FileSystemResource |
| Missing Content-Disposition | Browser displays instead of downloads | Always set attachment header |
| Not setting Content-Length | No progress bar for client | Calculate and set size |
| Not flushing output stream | Client hangs waiting | Flush after each chunk |
