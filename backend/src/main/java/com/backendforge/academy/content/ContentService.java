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

    public List<ModuleDto> modules() {
        return modules.findAllByOrderByOrderIndexAsc().stream()
                .map(m -> ModuleDto.from(m, lessons.countByModuleId(m.getId()),
                        lessons.findByModuleIdOrderByOrderIndexAsc(m.getId()).stream()
                                .mapToInt(Lesson::getMinutes).sum()))
                .toList();
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
        return LessonDto.from(l, moduleTitle);
    }

    public Optional<Lesson> lessonEntity(String id) {
        return lessons.findById(id);
    }

    /** Lightweight keyword search with simple scoring across title / summary / body. */
    public List<SearchResultDto> search(String query) {
        if (query == null || query.isBlank()) return List.of();
        String[] tokens = query.toLowerCase(Locale.ROOT).split("[^a-z0-9+#.-]+");
        Map<String, String> titles = moduleTitles();
        List<SearchResultDto> results = new ArrayList<>();
        for (Lesson l : lessons.findAll()) {
            double score = 0;
            for (String token : tokens) {
                if (token.isBlank()) continue;
                if (l.getTitle().toLowerCase(Locale.ROOT).contains(token)) score += 5;
                if (l.getSummary().toLowerCase(Locale.ROOT).contains(token)) score += 3;
                if (bodyContains(l, token)) score += 1;
            }
            if (score > 0) {
                results.add(new SearchResultDto(l.getId(), l.getModuleId(),
                        titles.get(l.getModuleId()),
                        l.getTitle(), snippet(l, query), score));
            }
        }
        results.sort(Comparator.comparingDouble(SearchResultDto::score).reversed());
        return results.stream().limit(20).toList();
    }

    public StatsDto stats(long completedLessons, long totalLessons, long docsLinks) {
        List<Lesson> all = lessons.findAll();
        return new StatsDto(modules.count(), all.size(),
                all.stream().mapToInt(Lesson::getMinutes).sum(),
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
