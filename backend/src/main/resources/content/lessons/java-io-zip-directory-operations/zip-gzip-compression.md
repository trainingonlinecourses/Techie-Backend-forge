---
title: ZIP and GZIP Compression in Java
summary: Java has built-in support for the two most common compression formats: ZIP (a container format that can hold many files with a directory structure) and GZIP (single-file compression). This lesson explains ZipOutputStream and ZipInputStream for creating and reading ZIP archives, GZIPOutputStream and GZIPInputStream for single-file compression, the underlying Deflater and Inflater, and the checksum options. It covers the mechanics, the gotchas, and the real-world patterns for compressing and decompressing data.
order: 1
minutes: 24
topics: [zip, gzip, compression, ZipOutputStream, ZipInputStream, GZIPOutputStream, GZIPInputStream, Deflater, Inflater, checksum, CRC, file-archive, io]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/zip/ZipOutputStream.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/zip/ZipInputStream.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/zip/GZIPOutputStream.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/zip/Deflater.html
---

## The Concept, From Zero

Compression reduces the size of data so it takes less space to store and less time to transfer. Java's `java.util.zip` package gives you the tools to compress data in two common formats: **ZIP** and **GZIP**, and the underlying compressor **Deflater** and decompressor **Inflater** that both formats use.

The two formats serve different purposes:

- **ZIP** is an archive format. A ZIP file is a container that can hold many files, each with its own name, size, timestamp, and compressed data, plus an optional directory structure. You create a ZIP archive with `ZipOutputStream` and read one with `ZipInputStream`. ZIP is what you use when you want to bundle several files into one compressed file — like a build artifact, a distribution package, or a backup.
- **GZIP** is a single-file compression format. A GZIP file is a compressed version of a single file (or a single stream of data). It does not hold multiple files or a directory structure. You compress with `GZIPOutputStream` and decompress with `GZIPInputStream`. GZIP is what you use when you want to compress one file or one stream — like compressing a log file before archiving it, or compressing an HTTP response body.

Both formats are based on the **DEFLATE** compression algorithm, which is a combination of LZ77 (a dictionary-based compression) and Huffman coding (a statistical compression). In Java, the `Deflater` class implements the compression side and `Inflater` implements the decompression side. `ZipOutputStream` and `GZIPOutputStream` use a `Deflater` internally, and `ZipInputStream` and `GZIPInputStream` use an `Inflater`.

You can use the higher-level stream classes (`ZipOutputStream`, `GZIPOutputStream`) for most tasks, or drop down to `Deflater` and `Inflater` directly if you want more control over the compression level, strategy, or the raw byte-level compression.

### ZIP Archives — Creating One with ZipOutputStream

A `ZipOutputStream` writes a ZIP archive to an underlying output stream (usually a `FileOutputStream` or a `ByteArrayOutputStream`). To create a ZIP archive, you:

1. Create a `ZipOutputStream` wrapping a `FileOutputStream`.
2. For each file you want to add, call `putNextEntry(new ZipEntry(name))` to start a new entry.
3. Write the file's data to the `ZipOutputStream`.
4. Call `closeEntry()` to finish the entry.
5. Close the `ZipOutputStream` when done.

A `ZipEntry` represents one entry in the ZIP archive — a file or directory. You create it with a name (which can include a path, like `dir/file.txt`). The `ZipEntry` stores metadata like the name, size, compressed size, modification time, and compression method.


**What this code does — step by step:**

1. Create a ZIP archive containing two text files
2. Entry 1: a text file
3. Entry 2: another text file
4. You can also add directories explicitly (as entries with isDirectory=true)
5. Entry 3: a file inside the directory

The same code, clean:

```java
import java.io.*;
import java.util.zip.*;

public class CreateZip {
    public static void main(String[] args) throws IOException {
        try (var out = new ZipOutputStream(new FileOutputStream("archive.zip"))) {

            out.putNextEntry(new ZipEntry("hello.txt"));
            out.write("Hello, World!\n".getBytes());
            out.closeEntry();

            out.putNextEntry(new ZipEntry("readme.txt"));
            out.write("This is a test archive.\n".getBytes());
            out.closeEntry();

            out.putNextEntry(new ZipEntry("subdir/"));
            out.closeEntry();

            out.putNextEntry(new ZipEntry("subdir/data.txt"));
            out.write("data inside subdir\n".getBytes());
            out.closeEntry();
        }

        System.out.println("archive.zip created");
    }
}
```

Line by line:

- **`new ZipOutputStream(new FileOutputStream("archive.zip"))`** — the ZIP output stream writes to `archive.zip`. The try-with-resources ensures the stream is closed, which finishes the ZIP file properly (writing the central directory at the end).
- **`out.putNextEntry(new ZipEntry("hello.txt"))`** — starts a new entry named `hello.txt`. After this call, anything you write to the `ZipOutputStream` is compressed and stored as the content of that entry.
- **`out.write(...)`** — writes the content of the entry. You can write as much data as you want here.
- **`out.closeEntry()`** — finishes the current entry. After this, the next `putNextEntry` starts a new entry. You must call `closeEntry()` for each entry before starting the next one, or the data will be combined into the previous entry.
- **Directory entry `new ZipEntry("subdir/")`** — directories in ZIP are usually entries with names ending in `/`. Setting `isDirectory = true` on the `ZipEntry` is also possible, but the trailing `/` convention is common. The entry itself has no content — `closeEntry()` is called immediately.
- **Closing the `ZipOutputStream`** — when the stream is closed, it writes the central directory at the end of the file, which lists all entries. This is required for a valid ZIP file.

A common mistake is forgetting `closeEntry()`. If you call `putNextEntry()` without calling `closeEntry()` on the previous entry, the previous entry's data is not properly finished and the ZIP file may be malformed or missing entries.

// BUG: forgetting closeEntry()
out.putNextEntry(new ZipEntry("file1.txt"));
out.write(data1);
// out.closeEntry();   // FORGOT — file1's data continues into file2
out.putNextEntry(new ZipEntry("file2.txt"));
out.write(data2);
out.closeEntry();
out.close();
// The resulting ZIP is corrupt — file1 and file2 are merged

Another common mistake is writing data before `putNextEntry()`. The `ZipOutputStream` must have an active entry before you write anything. Writing before the first `putNextEntry()` writes data that has no entry and may corrupt the archive.

// BUG: writing before putNextEntry
out.write("data".getBytes());   // no active entry — corrupt
out.putNextEntry(new ZipEntry("file.txt"));
out.closeEntry();

### Reading a ZIP Archive with ZipInputStream

A `ZipInputStream` reads a ZIP archive from an underlying input stream. To read a ZIP archive, you:

1. Create a `ZipInputStream` wrapping a `FileInputStream`.
2. Call `getNextEntry()` to get the next entry. This returns a `ZipEntry` or `null` when there are no more entries.
3. Read the entry's data from the `ZipInputStream`.
4. Call `closeEntry()` when done with the entry (optional for reading, but good practice).
5. Repeat until `getNextEntry()` returns `null`.

import java.io.*;
import java.util.zip.*;

public class ReadZip {
    public static void main(String[] args) throws IOException {
        try (var in = new ZipInputStream(new FileInputStream("archive.zip"))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                System.out.println("entry: " + entry.getName() +
                                   ", size: " + entry.getSize() +
                                   ", compressed: " + entry.getCompressedSize());

                // Read the entry's data
                if (!entry.isDirectory()) {
                    try (var out = new FileOutputStream("extracted/" + entry.getName())) {
                        byte[] buffer = new byte[8192];
                        int n;
                        while ((n = in.read(buffer)) != -1) {
                            out.write(buffer, 0, n);
                        }
                    }
                }

                in.closeEntry();
            }
        }
    }
}

Line by line:

- **`new ZipInputStream(new FileInputStream("archive.zip"))`** — opens the ZIP archive for reading.
- **`in.getNextEntry()`** — returns the next entry, or `null` when done. The `ZipInputStream` position is now at the start of this entry's data.
- **`entry.getName()`** — the name of the entry, which may include a path (like `subdir/data.txt`).
- **`entry.isDirectory()`** — `true` if the entry is a directory. You usually skip reading data for directory entries.
- **Reading the data** — you read from the `ZipInputStream` after `getNextEntry()` and before `closeEntry()`. The data is decompressed automatically by the `ZipInputStream`'s internal `Inflater`.
- **`in.closeEntry()`** — advances the stream to the next entry. For reading, `closeEntry()` is not strictly required (calling `getNextEntry()` implicitly closes the previous entry), but it is good practice and explicit.
- **The try-with-resources on `ZipInputStream`** closes the stream, which finishes reading.

A common mistake is reading from the `ZipInputStream` before calling `getNextEntry()` or after `closeEntry()`. The stream only has data when an entry is active. Reading before the first `getNextEntry()` returns nothing useful, and reading after `closeEntry()` skips to the next entry or returns end-of-file.

// BUG: reading before getNextEntry
in.read(buffer);   // no active entry — reads nothing useful
ZipEntry entry = in.getNextEntry();   // now we have an entry

### GZIP Compression — Single-File Compression with GZIPOutputStream

GZIP compression is simpler than ZIP because it handles only one stream of data. You wrap an output stream with a `GZIPOutputStream`, write data to it, and close it. The result is a GZIP-compressed file.

import java.io.*;
import java.util.zip.*;

public class CompressGzip {
    public static void main(String[] args) throws IOException {
        // Compress a file into a .gz file
        try (var in = new FileInputStream("input.txt");
             var out = new GZIPOutputStream(new FileOutputStream("input.txt.gz"))) {

            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                out.write(buffer, 0, n);
            }
        }
        System.out.println("input.txt.gz created");
    }
}

Line by line:

- **`new GZIPOutputStream(new FileOutputStream("input.txt.gz"))`** — the GZIP output stream writes to `input.txt.gz`. The `.gz` extension is a convention, not a requirement, but it helps tools and humans recognise the format.
- **Reading the input file and writing to the GZIP output** — the data passes through the GZIP compressor and is written as a GZIP file. The `GZIPOutputStream` handles the GZIP header, the compressed data, and the GZIP trailer (which includes a CRC-32 checksum).
- **Closing the GZIPOutputStream** — when closed, it writes the GZIP trailer and finishes the file. The try-with-resources ensures this happens.

To decompress a GZIP file, you wrap a `FileInputStream` with a `GZIPInputStream` and read from it. The `GZIPInputStream` decompresses the data on the fly.

import java.io.*;
import java.util.zip.*;

public class DecompressGzip {
    public static void main(String[] args) throws IOException {
        // Decompress a .gz file
        try (var in = new GZIPInputStream(new FileInputStream("input.txt.gz"));
             var out = new FileOutputStream("output.txt")) {

            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                out.write(buffer, 0, n);
            }
        }
        System.out.println("output.txt created");
    }
}

Line by line:

- **`new GZIPInputStream(new FileInputStream("input.txt.gz"))`** — opens the GZIP file for decompression. The `GZIPInputStream` reads the GZIP header, decompresses the data using an `Inflater`, and verifies the CRC-32 checksum in the trailer.
- **Reading from the GZIPInputStream** — the data comes out decompressed. You write it to an output file.
- **Closing** — when the `GZIPInputStream` is closed, it finishes reading and verifies the checksum. If the checksum does not match (the file was corrupted or truncated), it throws an `IOException`.

A common mistake with GZIP is trying to use a `GZIPInputStream` to read a ZIP file. A GZIP file is not a ZIP file — it is a single compressed stream, not a multi-entry archive. A `GZIPInputStream` cannot read a ZIP archive. Use `ZipInputStream` for ZIP.

// BUG: trying to read a ZIP file with GZIPInputStream
try (var in = new GZIPInputStream(new FileInputStream("archive.zip"))) {
    // Throws IOException — not a valid GZIP file
}

Another common mistake is not closing the `GZIPOutputStream`, which leaves the GZIP trailer unwritten and produces a corrupt GZIP file. The try-with-resources pattern prevents this.

### The Underlying Deflater and Inflater

If you need more control over compression — the compression level, the compression strategy, or the raw byte-level compression — you can use `Deflater` and `Inflater` directly. These are the low-level compressors that the stream classes use internally.

import java.util.zip.*;

public class DeflaterDemo {
    public static void main(String[] args) {
        String data = "Hello, World! This is some data to compress. ".repeat(100);

        // Compress with Deflater
        Deflater deflater = new Deflater();
        deflater.setInput(data.getBytes());
        deflater.finish();
        byte[] compressed = new byte[1024];
        int compressedSize = deflater.deflate(compressed);
        System.out.println("compressed size: " + compressedSize);
        System.out.println("compression ratio: " + (1.0 - (double) compressedSize / data.getBytes().length));

        // Decompress with Inflater
        Inflater inflater = new Inflater();
        inflater.setInput(compressed, 0, compressedSize);
        byte[] decompressed = new byte[data.getBytes().length + 100];
        int decompressedSize = inflater.inflate(decompressed);
        String result = new String(decompressed, 0, decompressedSize);
        System.out.println("decompressed matches: " + result.equals(data));
    }
}

Line by line:

- **`new Deflater()`** — creates a compressor. The default compression level is `Deflater.DEFAULT_COMPRESSION` (which is 6, a middle ground). You can set the level with `setLevel(int level)` where 0 is no compression and 9 is maximum compression.
- **`deflater.setInput(data.getBytes())`** — provides the data to compress. You can call `setInput` multiple times if the data is large and you are feeding it in chunks.
- **`deflater.finish()`** — tells the compressor that all input has been provided and it should finish the compression. After `finish()`, you call `deflate` to get the compressed data.
- **`deflater.deflate(compressed)`** — compresses the data into the `compressed` buffer and returns the number of bytes written. You may need to call `deflate` multiple times if the output is large.
- **`new Inflater()`** — creates a decompressor. You provide the compressed data with `setInput`, then call `inflate` to decompress.
- **`inflater.setInput(compressed, 0, compressedSize)`** — provides the compressed data to decompress.
- **`inflater.inflate(decompressed)`** — decompresses into the `decompressed` buffer and returns the number of bytes written.
- **Checking the result** — the decompressed data should match the original.

The `Deflater` and `Inflater` classes are stateful. You set input, call `deflate`/`inflate`, check the result, and repeat if necessary. The stream classes (`ZipOutputStream`, `GZIPOutputStream`, `ZipInputStream`, `GZIPInputStream`) wrap this machinery and make it easier to use with streams.

You can control the compression level:


**What this code does — step by step:**

1. `deflater.setLevel(Deflater.BEST_COMPRESSION);` — 9 — slowest, smallest
2. or
3. `deflater.setLevel(Deflater.NO_COMPRESSION);` — 0 — fast, no compression
4. or
5. `deflater.setLevel(Deflater.BEST_SPEED);` — 1 — fast, some compression

The same code, clean:

```java
Deflater deflater = new Deflater();
deflater.setLevel(Deflater.BEST_COMPRESSION);
deflater.setLevel(Deflater.NO_COMPRESSION);
deflater.setLevel(Deflater.BEST_SPEED);
```

Higher compression levels produce smaller output but take more time. For most applications, the default level (6) is a good balance. Only tune the level if you have measured a real need — for example, compressing a large distribution archive where size matters more than time, or a real-time stream where speed matters more than size.

### Checksums — CRC and Other Integrity Checks

A GZIP file includes a CRC-32 checksum of the uncompressed data in its trailer. When you decompress with `GZIPInputStream`, the checksum is verified automatically, and a mismatch throws an `IOException`. This is a data integrity check — it detects corruption or truncation.

ZIP archives can also include checksums. A `ZipEntry` has a `getCrc()` method that returns the CRC-32 of the entry's uncompressed data. When you create a ZIP archive with `ZipOutputStream`, the CRC is computed automatically if you provide the data. You can also use `CheckedOutputStream` and `CheckedInputStream` from `java.util.zip` to compute checksums as you read or write data.

import java.io.*;
import java.util.zip.*;

public class ChecksumDemo {
    public static void main(String[] args) throws IOException {
        // Compute CRC-32 of a file while copying it
        try (var in = new FileInputStream("input.txt");
             var out = new FileOutputStream("copy.txt");
             var checkedOut = new CheckedOutputStream(out, new CRC32())) {

            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                checkedOut.write(buffer, 0, n);
            }

            System.out.println("CRC-32: " + checkedOut.getChecksum().getValue());
        }
    }
}

Line by line:

- **`new CheckedOutputStream(out, new CRC32())`** — wraps the output stream and computes a CRC-32 checksum of everything written to it.
- **Writing data** — as you write, the checksum is updated.
- **`checkedOut.getChecksum().getValue()`** — returns the final CRC-32 value. You can compare this with the CRC of the original file to verify integrity.

Checksums are useful when you transfer files or store compressed archives and want to detect corruption. GZIP does this automatically; for ZIP and raw compression, you can use `CheckedOutputStream` and `CheckedInputStream` if you want explicit checksums.

### A Code Example — Create, Read, Compress, Decompress

This example exercises all four operations: creating a ZIP archive, reading a ZIP archive, compressing with GZIP, and decompressing with GZIP.


**What this code does — step by step:**

1. Create a ZIP archive containing several files
2. Read a ZIP archive and extract its entries
3. Compress a file with GZIP
4. Decompress a GZIP file
5. Set up a temp workspace
6. ZIP: create and read
7. GZIP: compress and decompress
8. Verify
9. Cleanup is optional — the temp directory goes away on exit

The same code, clean:

```java
import java.io.*;
import java.nio.file.*;
import java.util.zip.*;

public class CompressionExample {

    static void createZip(Path zipPath, Path... files) throws IOException {
        try (var out = new ZipOutputStream(new FileOutputStream(zipPath.toFile()))) {
            for (Path file : files) {
                String entryName = file.getName().toString();
                out.putNextEntry(new ZipEntry(entryName));
                Files.copy(file, out);
                out.closeEntry();
            }
        }
        System.out.println("created: " + zipPath);
    }

    static void readZip(Path zipPath, Path extractDir) throws IOException {
        Files.createDirectories(extractDir);
        try (var in = new ZipInputStream(new FileInputStream(zipPath.toFile()))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                Path target = extractDir.resolve(entry.getName());
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    try (var out = new FileOutputStream(target.toFile())) {
                        in.transferTo(out);
                    }
                }
                in.closeEntry();
            }
        }
        System.out.println("extracted to: " + extractDir);
    }

    static void compressGzip(Path input, Path output) throws IOException {
        try (var in = new FileInputStream(input.toFile());
             var out = new GZIPOutputStream(new FileOutputStream(output.toFile()))) {
            in.transferTo(out);
        }
        System.out.println("compressed: " + output);
    }

    static void decompressGzip(Path input, Path output) throws IOException {
        try (var in = new GZIPInputStream(new FileInputStream(input.toFile()));
             var out = new FileOutputStream(output.toFile())) {
            in.transferTo(out);
        }
        System.out.println("decompressed: " + output);
    }

    public static void main(String[] args) throws IOException {
        Path work = Files.createTempDirectory("compression-demo");
        Path hello = work.resolve("hello.txt");
        Path readme = work.resolve("readme.txt");

        Files.writeString(hello, "Hello, World!\n");
        Files.writeString(readme, "This is a test archive.\n");

        Path zip = work.resolve("archive.zip");
        createZip(zip, hello, readme);
        Path extracted = work.resolve("extracted");
        readZip(zip, extracted);

        Path gz = work.resolve("hello.txt.gz");
        compressGzip(hello, gz);
        Path decompressed = work.resolve("hello-decompressed.txt");
        decompressGzip(gz, decompressed);

        System.out.println("original matches decompressed: " +
            Files.readString(hello).equals(Files.readString(decompressed)));

    }
}
```

Line by line:

- **`createZip`** — creates a ZIP archive. For each file, it puts a `ZipEntry` with the file's name, copies the file's content into the `ZipOutputStream`, and closes the entry. The try-with-resources on `ZipOutputStream` finishes the archive.
- **`readZip`** — reads a ZIP archive. It loops over entries with `getNextEntry()`, creates the target directory or file, and copies the entry's data out with `in.transferTo(out)`. `transferTo` is a convenient Java 9+ method that copies all remaining data from an `InputStream` to an `OutputStream`.
- **`compressGzip`** — compresses a file into a GZIP file. It wraps the output with `GZIPOutputStream` and copies the input through it.
- **`decompressGzip`** — decompresses a GZIP file. It wraps the input with `GZIPInputStream` and copies the decompressed data to the output.
- **`Files.copy` and `in.transferTo(out)`** — the convenient ways to move data between streams. `transferTo` is available since Java 9.

This example shows the full lifecycle: create a multi-file ZIP, read it back, compress a single file with GZIP, and decompress it. The operations are independent — you can mix and match them as needed.

## Where This Shows Up in an Organization

In a backend team, ZIP and GZIP show up in several places.

- **Build artifacts and distributions.** A build pipeline often produces a ZIP archive of the application — a JAR, configuration, and scripts bundled together. Java's `ZipOutputStream` can create these archives programmatically, though build tools like Maven and Gradle do this more often.
- **Backup and archive.** A backup tool might create a ZIP archive of log files or data directories, or compress old log files with GZIP to save space. The JDK's `ZipOutputStream` and `GZIPOutputStream` are the tools for this.
- **Data transfer.** When transferring large files, compressing them first with GZIP reduces transfer time and bandwidth. A service that sends large reports or data exports might GZIP them before sending.
- **HTTP compression.** Web servers and clients often use GZIP to compress HTTP response bodies. While web frameworks usually handle this, the underlying mechanism is GZIP compression, and the JDK's `GZIPOutputStream` is the tool that would be used if you implemented it yourself.
- **Reading archives uploaded by users.** If a service accepts ZIP uploads — a batch import, a file submission — it reads the ZIP archive with `ZipInputStream` and extracts the entries.

The key skill is knowing which format to use. If you need to bundle multiple files with names and paths, use ZIP. If you need to compress a single file or stream, use GZIP. If you need to compress data in memory or in a custom way with control over the compression level, use `Deflater` and `Inflater`.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Forgetting `closeEntry()` after writing an entry with `ZipOutputStream` | The entry's data is not properly finished | Call `closeEntry()` after writing each entry's data |
| Writing data before `putNextEntry()` with `ZipOutputStream` | No active entry — the data goes nowhere useful | Call `putNextEntry()` before writing |
| Using `GZIPInputStream` to read a ZIP file | GZIP is a single-stream format; ZIP is a multi-entry archive | Use `ZipInputStream` for ZIP, `GZIPInputStream` for GZIP |
| Not closing the `ZipOutputStream` or `GZIPOutputStream` | The central directory (ZIP) or trailer (GZIP) is not written, corrupting the file | Use try-with-resources to ensure the stream is closed |
| Trying to read a ZIP entry's data after `closeEntry()` | The entry is no longer active; reading skips to the next entry | Read the entry's data between `getNextEntry()` and `closeEntry()` |
| Using the wrong compression level for the workload | High compression is slow; no compression wastes space | Use the default level unless you have a measured need to tune |
| Not verifying a GZIP file's integrity | GZIP checks the CRC on decompression, but only if you read the whole stream | If you only partially read a GZIP stream, the checksum may not be verified; read the full stream to trigger verification |
| Creating a `ZipEntry` with a name that includes path traversal characters like `../` | A malicious entry name could write files outside the target directory | Validate entry names if you are reading untrusted archives — reject names containing `..` or absolute paths |
| Assuming ZIP compression always reduces size | Small or already-compressed files may not compress much, or may grow slightly | Test with realistic data; for very small files, the overhead of the ZIP structure may exceed the savings |

## For the Practice Lab

In the lab, you will see a workspace with two text files and a broken ZIP creation that forgets `closeEntry()`. Fix the creation so the ZIP archive is valid, then read the archive back and extract the entries. Then add GZIP compression and decompression for one of the files and verify the decompressed content matches the original. Finally, add a checksum step that computes a CRC-32 of the original file and compares it with the CRC of the decompressed file (which GZIP verifies automatically, but you can compute it explicitly for learning).

## Summary

Java's `java.util.zip` package provides `ZipOutputStream` and `ZipInputStream` for ZIP archives (multi-file containers) and `GZIPOutputStream` and `GZIPInputStream` for single-file GZIP compression. Both use the DEFLATE algorithm internally, via `Deflater` and `Inflater`. To create a ZIP archive, open a `ZipOutputStream`, call `putNextEntry` for each entry, write the data, and call `closeEntry` — forgetting `closeEntry` corrupts the archive. To read a ZIP, open a `ZipInputStream`, call `getNextEntry` in a loop, read each entry's data, and close the entry. To compress with GZIP, wrap an output stream with `GZIPOutputStream` and write; to decompress, wrap an input stream with `GZIPInputStream` and read. GZIP verifies a CRC-32 checksum on decompression; for ZIP and raw compression, you can use `CheckedOutputStream` and `CheckedInputStream` for explicit checksums. Use ZIP for multi-file archives, GZIP for single-file compression, and `Deflater`/`Inflater` for low-level control over compression level and strategy.

## References

- [Codecademy — Learn Java course](https://www.codecademy.com/learn/learn-java)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/zip/package-summary.html)
