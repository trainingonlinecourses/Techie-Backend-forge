package com.backendforge.academy.content;

import com.backendforge.academy.content.ContentDtos.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Seeds the database from {@code classpath:content/}:
 * <ul>
 *   <li>{@code modules.json} — module metadata</li>
 *   <li>{@code lessons/<module>/<slug>.md} — lessons with YAML-ish front matter</li>
 *   <li>{@code docs-index.json} — curated links into the official docs (via DocsIndexService)</li>
 * </ul>
 *
 * <p><b>Why this loader is fast:</b> the first version did one {@code findById} SELECT plus
 * one {@code save} per lesson/module — ~1,800 sequential round trips to a remote Postgres
 * (Supabase/Render pooler) on every boot, which pushed startup into minutes on the free tier.
 * This version:
 * <ol>
 *   <li>Parses all classpath content up front (cheap, local jar reads).</li>
 *   <li>Compares per-row SHA-256 content hashes with two lightweight SELECTs. If nothing
 *       changed — the common case — it touches nothing else and returns immediately.</li>
 *   <li>When content did change, it wipes the two content tables and re-inserts every row
 *       as a batch (with {@code hibernate.jdbc.batch_size}, that is a handful of INSERT
 *       statements, not thousands of round trips).</li>
 * </ol>
 * Idempotent and safe to re-run; user data (progress, chats, users) lives in other tables
 * and is never touched. Lesson/module ids are stable across reseeds, so progress entries
 * that reference lesson ids keep working.
 */
@Component
public class ContentLoader implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ContentLoader.class);
    private static final Pattern FRONT_MATTER = Pattern.compile(
            "^---\\n(.*?)\\n---\\n(.*)$", Pattern.DOTALL);
    private static final Pattern KEY_VALUE = Pattern.compile("^\\s*([A-Za-z-]+):\\s*(.*)$");

    private final ObjectMapper mapper;
    private final ModuleRepository modules;
    private final LessonRepository lessons;
    private final DocsIndexService docsIndex;

    public ContentLoader(ObjectMapper mapper, ModuleRepository modules,
                         LessonRepository lessons, DocsIndexService docsIndex) {
        this.mapper = mapper;
        this.modules = modules;
        this.lessons = lessons;
        this.docsIndex = docsIndex;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        long t0 = System.nanoTime();

        List<Map<String, Object>> rawModules = readModulesJson();
        List<SeedLesson> seedLessons = readLessonFiles();

        if (databaseMatches(rawModules, seedLessons)) {
            docsIndex.load();
            log.info("Content ready (unchanged, skipped reseed): {} modules, {} lessons, {} doc links in {} ms",
                    rawModules.size(), seedLessons.size(), docsIndex.count(),
                    (System.nanoTime() - t0) / 1_000_000);
            return;
        }

        log.info("Content changed (or first boot) — reseeding {} modules and {} lessons",
                rawModules.size(), seedLessons.size());
        lessons.deleteAllInBatch();
        modules.deleteAllInBatch();
        for (Map<String, Object> m : rawModules) {
            modules.save(toModule(m));
        }
        for (SeedLesson sl : seedLessons) {
            lessons.save(toLesson(sl));
        }

        docsIndex.load();
        log.info("Content ready (reseeded): {} modules, {} lessons, {} doc links in {} ms",
                rawModules.size(), seedLessons.size(), docsIndex.count(),
                (System.nanoTime() - t0) / 1_000_000);
    }

    // ---- seed data reading (classpath only, no DB) ---------------------------

    private List<Map<String, Object>> readModulesJson() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/content/modules.json")) {
            if (in == null) throw new IllegalStateException("content/modules.json missing on classpath");
            return mapper.readValue(in, new TypeReference<>() {});
        }
    }

    private record SeedLesson(String moduleId, String slug, String rawText,
                              Map<String, String> meta, String body, String hash) {}

    private List<SeedLesson> readLessonFiles() throws IOException {
        Resource[] resources = new PathMatchingResourcePatternResolver()
                .getResources("classpath:content/lessons/*/*.md");
        List<SeedLesson> result = new ArrayList<>(resources.length);
        // Lesson ids are the file slug (globally unique in the DB). A slug repeated
        // across two module folders collapses to one row (last file wins — the same
        // semantics save() gives us), so dedupe here to keep counts comparable.
        Map<String, SeedLesson> bySlug = new LinkedHashMap<>();
        for (Resource resource : resources) {
            String url = resource.getURL().toString(); // .../content/lessons/<module>/<slug>.md
            int idx = url.indexOf("/content/lessons/");
            String rel = url.substring(idx + "/content/lessons/".length());
            String[] parts = rel.split("/");
            String moduleId = parts[parts.length - 2];
            String slug = parts[parts.length - 1].replaceAll("\\.md$", "");
            String text = resource.getContentAsString(StandardCharsets.UTF_8)
                    .replace("\r\n", "\n"); // normalize CRLF (Windows checkouts) so front matter parses and hashes are platform-stable

            ParsedLesson parsed = parse(text);
            bySlug.put(slug, new SeedLesson(moduleId, slug, text, parsed.meta(), parsed.body(),
                    sha256(text)));
        }
        result.addAll(bySlug.values());
        return result;
    }

    // ---- change detection ----------------------------------------------------

    /**
     * True when the database already holds exactly this content (same ids, same hashes).
     * Two hash-aggregating SELECTs total — no per-row lookups.
     */
    private boolean databaseMatches(List<Map<String, Object>> rawModules,
                                    List<SeedLesson> seedLessons) {
        if (lessons.count() != seedLessons.size() || modules.count() != rawModules.size()) {
            return false;
        }
        Map<String, String> dbLessonHashes = new HashMap<>();
        for (Object[] row : lessons.findAllIdAndHash()) {
            dbLessonHashes.put((String) row[0], (String) row[1]);
        }
        for (SeedLesson sl : seedLessons) {
            if (!sl.hash().equals(dbLessonHashes.get(sl.slug()))) return false;
        }
        Map<String, String> dbModuleHashes = new HashMap<>();
        for (Object[] row : modules.findAllIdAndHash()) {
            dbModuleHashes.put((String) row[0], (String) row[1]);
        }
        for (Map<String, Object> m : rawModules) {
            String id = (String) m.get("id");
            if (!moduleHash(m).equals(dbModuleHashes.get(id))) return false;
        }
        return true;
    }

    // ---- entity mapping -------------------------------------------------------

    private Module toModule(Map<String, Object> m) {
        Module module = new Module();
        module.setId((String) m.get("id"));
        module.setTitle((String) m.get("title"));
        module.setSubtitle((String) m.get("subtitle"));
        module.setOrderIndex((Integer) m.get("order"));
        module.setColor((String) m.get("color"));
        module.setDocsUrl((String) m.get("docsUrl"));
        module.getTech().addAll(castStringList(m.get("tech")));
        module.setContentHash(moduleHash(m));
        return module;
    }

    private Lesson toLesson(SeedLesson sl) {
        Lesson lesson = new Lesson();
        lesson.setId(sl.slug());
        lesson.setModuleId(sl.moduleId());
        lesson.setTitle(sl.meta().getOrDefault("title", sl.slug()));
        lesson.setSummary(sl.meta().getOrDefault("summary", ""));
        lesson.setOrderIndex(parseInt(sl.meta().get("order"), 99));
        lesson.setMinutes(parseInt(sl.meta().get("minutes"), 10));
        lesson.setCapstone(Boolean.parseBoolean(sl.meta().getOrDefault("capstone", "false")));
        lesson.getTopics().addAll(parseList(sl.meta().get("topics")));
        lesson.getDocs().addAll(parseList(sl.meta().get("docs")));
        lesson.setBody(sl.body());
        lesson.setContentHash(sl.hash());
        return lesson;
    }

    /** Modules are small — hash their JSON fragment (order-independent enough for change detection). */
    private String moduleHash(Map<String, Object> m) {
        try {
            return sha256(mapper.writeValueAsString(m));
        } catch (Exception e) {
            // Should never happen for a parsed tree; fall back to a full reseed signal.
            return UUID.randomUUID().toString();
        }
    }

    // ---- hashing / parsing helpers -------------------------------------------

    private static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) hex.append(Character.forDigit((b >> 4) & 0xF, 16))
                    .append(Character.forDigit(b & 0xF, 16));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private record ParsedLesson(Map<String, String> meta, String body) {}

    private ParsedLesson parse(String text) {
        Matcher m = FRONT_MATTER.matcher(text);
        if (!m.matches()) return new ParsedLesson(Map.of(), text);
        Map<String, String> meta = new LinkedHashMap<>();
        List<String> docs = new ArrayList<>();
        boolean inDocs = false;
        String pendingUrl = null; // url from a title/url pair, resolved when the next line carries url:
        for (String line : m.group(1).split("\\n")) {
            String trimmed = line.trim();
            // Check for key-value pairs even inside the docs block —
            // summary/order/minutes may appear after docs in some files.
            if (inDocs && !trimmed.startsWith("-")) {
                Matcher kvInside = KEY_VALUE.matcher(line);
                if (kvInside.matches()) {
                    String k = kvInside.group(1);
                    if (!k.equals("docs")) {
                        meta.put(k, kvInside.group(2));
                        continue;
                    }
                }
            }
            if (inDocs) {
                if (trimmed.startsWith("-")) {
                    // New entry: flush any pending url, then capture this line's url if present.
                    if (pendingUrl != null) docs.add(pendingUrl);
                    pendingUrl = null;
                    String entry = trimmed.substring(1).trim();
                    Matcher urlM = Pattern.compile("url\\s*[:=]\\s*[\"']?([^\"'\\s]+)[\"']?").matcher(entry);
                    if (urlM.find()) {
                        pendingUrl = urlM.group(1);
                    } else if (entry.matches("https?://.*")) {
                        docs.add(entry.replaceAll("[\"']", ""));
                    }
                } else {
                    // Continuation line of the previous entry — carry title/url pairs here.
                    Matcher urlM = Pattern.compile("url\\s*[:=]\\s*[\"']?([^\"'\\s]+)[\"']?").matcher(trimmed);
                    if (urlM.find()) pendingUrl = urlM.group(1);
                }
                continue;
            }
            Matcher kv = KEY_VALUE.matcher(line);
            if (kv.matches()) {
                String key = kv.group(1);
                String val = kv.group(2);
                if (key.equals("docs")) {
                    inDocs = true;
                } else {
                    meta.put(key, val);
                }
                continue;
            }
        }
        if (pendingUrl != null) docs.add(pendingUrl);
        if (!docs.isEmpty()) meta.put("docs", String.join(",", docs));
        return new ParsedLesson(meta, m.group(2));
    }

    private int parseInt(String v, int def) {
        try {
            return v == null ? def : Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private List<String> parseList(String v) {
        if (v == null || v.isBlank()) return List.of();
        String trimmed = v.trim();
        if (trimmed.startsWith("[")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return Arrays.stream(trimmed.split(","))
                .map(String::trim)
                .map(s -> s.replaceAll("^[\"']+|[\"']+$", "")) // strip surrounding quotes
                .filter(s -> !s.isBlank())
                .toList();
    }

    @SuppressWarnings("unchecked")
    private List<String> castStringList(Object o) {
        if (o instanceof List<?> list) return (List<String>) list;
        return List.of();
    }
}
