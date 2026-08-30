package com.backendforge.academy.content;

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
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Seeds the database from {@code classpath:content/}:
 * <ul>
 *   <li>{@code modules.json} — module metadata</li>
 *   <li>{@code lessons/<module>/<slug>.md} — lessons with YAML-ish front matter</li>
 *   <li>{@code docs-index.json} — curated links into the official docs</li>
 * </ul>
 * Idempotent: re-runs update existing rows instead of duplicating them.
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
        loadModules();
        loadLessons();
        docsIndex.load();
        log.info("Content ready: {} modules, {} lessons, {} doc links",
                modules.count(), lessons.count(), docsIndex.count());
    }

    private void loadModules() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/content/modules.json")) {
            if (in == null) throw new IllegalStateException("content/modules.json missing on classpath");
            List<Map<String, Object>> raw = mapper.readValue(in, new TypeReference<>() {});
            for (Map<String, Object> m : raw) {
                // Reuse existing rows (like loadLessons) — on Postgres a plain
                // save() with a set id always INSERTs, so a redeploy against a
                // populated database would die with a duplicate-key error.
                String id = (String) m.get("id");
                Module module = modules.findById(id).orElseGet(Module::new);
                module.setId(id);
                module.setTitle((String) m.get("title"));
                module.setSubtitle((String) m.get("subtitle"));
                module.setOrderIndex((Integer) m.get("order"));
                module.setColor((String) m.get("color"));
                module.setDocsUrl((String) m.get("docsUrl"));
                module.getTech().clear();
                module.getTech().addAll(castStringList(m.get("tech")));
                modules.save(module);
            }
        }
    }

    private void loadLessons() throws IOException {
        Resource[] resources = new PathMatchingResourcePatternResolver()
                .getResources("classpath:content/lessons/*/*.md");
        for (Resource resource : resources) {
            String url = resource.getURL().toString(); // .../content/lessons/<module>/<slug>.md
            int idx = url.indexOf("/content/lessons/");
            String rel = url.substring(idx + "/content/lessons/".length());
            String[] parts = rel.split("/");
            String moduleId = parts[parts.length - 2];
            String slug = parts[parts.length - 1].replaceAll("\\.md$", "");
            String text = resource.getContentAsString(StandardCharsets.UTF_8);

            ParsedLesson parsed = parse(text);
            Lesson lesson = lessons.findById(slug).orElseGet(Lesson::new);
            lesson.setId(slug);
            lesson.setModuleId(moduleId);
            lesson.setTitle(parsed.meta.getOrDefault("title", slug));
            lesson.setSummary(parsed.meta.getOrDefault("summary", ""));
            lesson.setOrderIndex(parseInt(parsed.meta.get("order"), 99));
            lesson.setMinutes(parseInt(parsed.meta.get("minutes"), 10));
            lesson.setCapstone(Boolean.parseBoolean(parsed.meta.getOrDefault("capstone", "false")));
            lesson.getTopics().clear();
            lesson.getTopics().addAll(parseList(parsed.meta.get("topics")));
            lesson.getDocs().clear();
            lesson.getDocs().addAll(parseList(parsed.meta.get("docs")));
            lesson.setBody(parsed.body);
            lessons.save(lesson);
        }
    }

    // ---- helpers -----------------------------------------------------------

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
