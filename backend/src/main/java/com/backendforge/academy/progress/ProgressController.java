package com.backendforge.academy.progress;

import com.backendforge.academy.content.ContentDtos.LessonSummaryDto;
import com.backendforge.academy.content.Lesson;
import com.backendforge.academy.content.LessonRepository;
import com.backendforge.academy.content.Module;
import com.backendforge.academy.content.ModuleRepository;
import com.backendforge.academy.security.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Per-user lesson progress (authenticated). */
@RestController
@RequestMapping("/api/progress")
public class ProgressController {

    private final ProgressService progress;
    private final LessonRepository lessons;
    private final ModuleRepository modules;

    public ProgressController(ProgressService progress, LessonRepository lessons, ModuleRepository modules) {
        this.progress = progress;
        this.lessons = lessons;
        this.modules = modules;
    }

    @GetMapping
    public Map<String, Boolean> progress(@AuthenticationPrincipal UserPrincipal principal) {
        return progress.progressMap(principal.user().getId());
    }

    @PostMapping("/{lessonId}")
    public Map<String, Boolean> complete(@AuthenticationPrincipal UserPrincipal principal,
                                         @PathVariable String lessonId) {
        progress.markComplete(principal.user().getId(), lessonId);
        return progress.progressMap(principal.user().getId());
    }

    @DeleteMapping("/{lessonId}")
    public Map<String, Boolean> uncomplete(@AuthenticationPrincipal UserPrincipal principal,
                                           @PathVariable String lessonId) {
        progress.unmark(principal.user().getId(), lessonId);
        return progress.progressMap(principal.user().getId());
    }

    /** Ordered list of completed lessons with their titles. */
    @GetMapping("/completed")
    public List<LessonSummaryDto> completed(@AuthenticationPrincipal UserPrincipal principal) {
        Map<String, String> titles = modules.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(Module::getId, Module::getTitle));
        return progress.completedLessonIds(principal.user().getId()).stream()
                .map(id -> lessons.findById(id)
                        .map(l -> LessonSummaryDto.from(l, titles.get(l.getModuleId())))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }
}
