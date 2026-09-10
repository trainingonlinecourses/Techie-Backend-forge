package com.backendforge.academy.progress;

import com.backendforge.academy.content.LessonRepository;
import com.backendforge.academy.content.LessonSummaryData;
import com.backendforge.academy.content.Module;
import com.backendforge.academy.content.ModuleRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Projects the user's raw completion rows into the gamification read-model.
 * Purely derived — XP, streaks and badges need no storage of their own.
 */
@Service
public class GamificationService {

    private final ProgressRepository progress;
    private final LessonRepository lessons;
    private final ModuleRepository modules;

    public GamificationService(ProgressRepository progress, LessonRepository lessons,
                               ModuleRepository modules) {
        this.progress = progress;
        this.lessons = lessons;
        this.modules = modules;
    }

    public Gamification.Summary summary(Long userId) {
        Map<String, LessonSummaryData> lessonMeta = new HashMap<>();
        Map<String, String> moduleLevel = new HashMap<>();
        Map<String, Long> totalsPerLevel = new HashMap<>();
        for (Module m : modules.findAll()) {
            moduleLevel.put(m.getId(), m.getLevel());
        }
        // One pass: per-lesson metadata + lesson totals per learning-path level.
        for (LessonSummaryData d : lessons.findAllSummaries()) {
            lessonMeta.put(d.id(), d);
            String level = moduleLevel.get(d.moduleId());
            if (level != null) totalsPerLevel.merge(level, 1L, Long::sum);
        }

        List<Gamification.Completion> completions = progress.findByUserIdOrderByCompletedAtAsc(userId)
                .stream()
                .map(e -> {
                    LessonSummaryData meta = lessonMeta.get(e.getLessonId());
                    if (meta == null) return null; // lesson vanished in a reseed — ignore it
                    String level = moduleLevel.get(meta.moduleId());
                    return new Gamification.Completion(e.getLessonId(), e.getCompletedAt(),
                            level, meta.minutes());
                })
                .filter(java.util.Objects::nonNull)
                .toList();

        return Gamification.summary(completions, totalsPerLevel, LocalDate.now(ZoneOffset.UTC));
    }
}
