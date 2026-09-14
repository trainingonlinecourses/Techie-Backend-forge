package com.backendforge.academy.content;

import com.backendforge.academy.common.NotFoundException;
import com.backendforge.academy.content.ContentDtos.*;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ContentService {

    private final ModuleRepository modules;
    private final LessonRepository lessons;

    public ContentService(ModuleRepository modules, LessonRepository lessons) {
        this.modules = modules;
        this.lessons = lessons;
    }

    /** moduleId → module title, for DTO mapping. */
    private Map<String, String> moduleTitles() {
        return modules.findAll().stream()
                .collect(Collectors.toMap(Module::getId, Module::getTitle));
    }

    /**
     * All modules with lesson counts/minutes in two queries (grouping in memory)
     * — the previous per-module count+fetch was N+1 and got slow as lessons grew.
     */
    public List<ModuleDto> modules() {
        List<Module> mods = modules.findAllByOrderByOrderIndexAsc();
        Map<String, List<Lesson>> byModule = lessons.findAll().stream()
                .collect(Collectors.groupingBy(Lesson::getModuleId));
        return mods.stream()
                .map(m -> {
                    List<Lesson> ls = byModule.getOrDefault(m.getId(), List.of());
                    return ModuleDto.from(m, ls.size(), ls.stream().mapToInt(Lesson::getMinutes).sum());
                })
                .toList();
    }

    /** The whole curriculum tree (modules + ordered lessons) in two lightweight queries. */
    public List<CurriculumModule> curriculum() {
        List<Module> mods = modules.findAllByOrderByOrderIndexAsc();
        Map<String, String> titles = mods.stream()
                .collect(Collectors.toMap(Module::getId, Module::getTitle));
        Map<String, List<LessonSummaryData>> byModule = lessons.findAllSummaries().stream()
                .collect(Collectors.groupingBy(LessonSummaryData::moduleId));
        return mods.stream().map(m -> {
            List<LessonSummaryData> ls = byModule.getOrDefault(m.getId(), List.of()).stream()
                    .sorted(Comparator.comparingInt(LessonSummaryData::order))
                    .toList();
            List<LessonSummaryDto> summaries = ls.stream()
                    .map(l -> LessonSummaryDto.from(l, titles.get(l.moduleId())))
                    .toList();
            return new CurriculumModule(ModuleDto.from(m, ls.size(),
                    ls.stream().mapToInt(LessonSummaryData::minutes).sum()), summaries);
        }).toList();
    }

    public ModuleDto module(String id) {
        Module m = modules.findById(id)
                .orElseThrow(() -> new NotFoundException("Module not found: " + id));
        List<Lesson> ls = lessons.findByModuleIdOrderByOrderIndexAsc(id);
        return ModuleDto.from(m, ls.size(), ls.stream().mapToInt(Lesson::getMinutes).sum());
    }

    public List<LessonSummaryDto> lessons(String moduleId) {
        Map<String, String> titles = moduleTitles();
        return lessons.findByModuleIdOrderByOrderIndexAsc(moduleId).stream()
                .map(l -> LessonSummaryDto.from(l, titles.get(l.getModuleId())))
                .toList();
    }

    public LessonDto lesson(String id) {
        Lesson l = lessons.findById(id)
                .orElseThrow(() -> new NotFoundException("Lesson not found: " + id));
        String moduleTitle = modules.findById(l.getModuleId())
                .map(Module::getTitle).orElse(null);
        return LessonDto.from(l, moduleTitle, derivePrereqs(l));
    }

    /**
     * Prerequisites of a lesson as frontend-presentable summaries:
     * first any explicit {@code requires:} tags, then (capped) the lessons the
     * curriculum places directly before this one — the natural reading path.
     * Skips the lesson itself, unknown ids, and same-position siblings; used by
     * LessonPage to warn learners who jump far ahead of what they've completed.
     */
    public List<LessonSummaryDto> derivePrereqs(Lesson lesson) {
        Map<String, String> titles = moduleTitles();
        List<LessonSummaryDto> out = new ArrayList<>();
        Set<String> tagged = new HashSet<>();

        // 1. Explicit tags from the lesson author — always authoritative.
        for (String slug : lesson.getPrereqs().stream().distinct().toList()) {
            lessons.findById(slug)
                    .map(l -> LessonSummaryDto.from(l, titles.get(l.getModuleId())))
                    .ifPresent(dto -> {
                        out.add(dto);
                        tagged.add(dto.id());
                    });
        }

        // 2. Up to three lessons directly before this one, in-order within the
        //    module and (when the module is exhausted) from the preceding module —
        //    i.e. the path a learner following the curriculum would have taken.
        //    Lessons already named explicitly are not repeated.
        int capacity = PREREQ_CONTEXT_LIMIT - out.size();
        if (capacity > 0) {
            pathBefore(lesson, capacity).stream()
                    .filter(p -> !tagged.contains(p.id()))
                    .limit(capacity)
                    .forEach(out::add);
        }
        return out;
    }

    /**
     * The ordered lessons a learner would have read immediately before this one,
     * spanning module borders. Uses the lightweight summary projection (no bodies)
     * and matches the current lesson by id — the passed entity comes from a
     * different persistence context than the listing, so identity would fail.
     */
    private List<LessonSummaryDto> pathBefore(Lesson lesson, int limit) {
        List<Module> mods = modules.findAllByOrderByOrderIndexAsc();
        Map<String, String> titles = mods.stream()
                .collect(Collectors.toMap(Module::getId, Module::getTitle));
        Map<String, List<LessonSummaryData>> byModule = lessons.findAllSummaries().stream()
                .collect(Collectors.groupingBy(LessonSummaryData::moduleId));

        List<LessonSummaryData> flat = new ArrayList<>();
        for (Module m : mods) {
            byModule.getOrDefault(m.getId(), List.of()).stream()
                    .sorted(Comparator.comparingInt(LessonSummaryData::order))
                    .forEach(flat::add);
        }
        int idx = -1;
        for (int i = 0; i < flat.size(); i++) {
            if (flat.get(i).id().equals(lesson.getId())) { idx = i; break; }
        }
        if (idx <= 0) return List.of();
        List<LessonSummaryDto> out = new ArrayList<>(Math.min(limit, idx));
        for (int i = Math.max(0, idx - limit); i < idx; i++) {
            LessonSummaryData d = flat.get(i);
            out.add(LessonSummaryDto.from(d, titles.get(d.moduleId())));
        }
        return out;
    }

    /** Context lessons served alongside a lesson's prerequisites. */
    private static final int PREREQ_CONTEXT_LIMIT = 3;

    public Optional<Lesson> lessonEntity(String id) {
        return lessons.findById(id);
    }

    /**
     * Keyword search with topic-aware scoring: titles weigh most, then summaries,
     * topic tags and phrase matches; body hits add depth but rank lower.
     */
    public List<SearchResultDto> search(String query) {
        if (query == null || query.isBlank()) return List.of();
        String q = query.toLowerCase(Locale.ROOT);
        String[] tokens = q.split("[^a-z0-9+#.-]+");
        Map<String, String> titles = moduleTitles();
        List<SearchResultDto> results = new ArrayList<>();
        for (Lesson l : lessons.findAll()) {
            String title = l.getTitle().toLowerCase(Locale.ROOT);
            String summary = l.getSummary().toLowerCase(Locale.ROOT);
            String topics = String.join(" ", l.getTopics()).toLowerCase(Locale.ROOT);

            double score = 0;
            boolean anyMatch = false;
            for (String token : tokens) {
                if (token.isBlank()) continue;
                anyMatch = true;
                if (title.contains(token)) score += 6;
                if (summary.contains(token)) score += 3;
                if (topics.contains(token)) score += 2;
                if (bodyContains(l, token)) score += 1;
            }
            if (!anyMatch) return List.of();
            // exact-phrase bonus — a query in quotes or a title that contains the phrase
            if (title.contains(q)) score += 8;
            if (summary.contains(q)) score += 3;

            if (score > 0) {
                results.add(new SearchResultDto(l.getId(), l.getModuleId(),
                        titles.get(l.getModuleId()),
                        l.getTitle(), snippet(l, query), score,
                        l.getTopics().size() > 3 ? l.getTopics().subList(0, 3) : l.getTopics()));
            }
        }
        results.sort(Comparator.comparingDouble(SearchResultDto::score).reversed());
        return results.stream().limit(20).toList();
    }

    public StatsDto stats(long completedLessons, long totalLessons, long docsLinks) {
        return new StatsDto(modules.count(), lessons.count(), lessons.totalMinutes(),
                docsLinks,
                completedLessons, totalLessons);
    }

    /** Context snippet around the first occurrence of the query. */
    private String snippet(Lesson l, String query) {
        String text = l.getBody().replaceAll("#{1,6}\\s", "").replaceAll("`", "");
        Pattern p = Pattern.compile(Pattern.quote(query), Pattern.CASE_INSENSITIVE);
        var m = p.matcher(text);
        if (!m.find()) {
            return text.substring(0, Math.min(220, text.length())).trim();
        }
        int start = Math.max(0, m.start() - 60);
        int end = Math.min(text.length(), m.end() + 160);
        String out = text.substring(start, end).replaceAll("\\s+", " ").trim();
        return (start > 0 ? "…" : "") + out + (end < text.length() ? "…" : "");
    }

    private boolean bodyContains(Lesson l, String token) {
        return l.getBody().toLowerCase(Locale.ROOT).contains(token);
    }

}
