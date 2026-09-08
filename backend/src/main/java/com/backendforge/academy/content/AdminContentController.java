package com.backendforge.academy.content;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Admin-only content management endpoints.
 * Protected by {@code @PreAuthorize("hasRole('ADMIN')} — only admin users can reorder.
 */
@RestController
@RequestMapping("/api/admin/content")
@PreAuthorize("hasRole('ADMIN')")
public class AdminContentController {

    private final LessonRepository lessons;

    public AdminContentController(LessonRepository lessons) {
        this.lessons = lessons;
    }

    /**
     * Reorder all lessons in a module. The client sends the full ordered list of
     * lesson IDs; the server assigns sequential orderIndex values.
     *
     * <p>Request body: { "lessonIds": ["lesson-a", "lesson-b", "lesson-c"] }
     * The first ID gets orderIndex 1, second gets 2, etc.
     *
     * <p>The submitted list must be a complete permutation of the module's lessons — a
     * partial list would silently drop lessons from the ordering, which is almost always
     * a client bug rather than intent.
     */
    @PutMapping("/modules/{moduleId}/reorder")
    public Map<String, Object> reorder(@PathVariable String moduleId,
                                       @RequestBody ReorderRequest req) {
        List<Lesson> moduleLessons = lessons.findByModuleIdOrderByOrderIndexAsc(moduleId);

        var moduleIds = moduleLessons.stream().map(Lesson::getId).toList();

        // Defensive checks: reject confused-client / buggy UI submissions.
        if (moduleLessons.isEmpty()) {
            throw new IllegalArgumentException("Module " + moduleId + " has no lessons");
        }
        if (req.lessonIds().size() != moduleLessons.size()) {
            throw new IllegalArgumentException(
                    "Expected " + moduleLessons.size() + " lesson ids, got " + req.lessonIds().size());
        }
        for (String id : req.lessonIds()) {
            if (!moduleIds.contains(id)) {
                throw new IllegalArgumentException(
                        "Lesson " + id + " does not belong to module " + moduleId);
            }
        }
        // Every id present exactly once.
        if (req.lessonIds().stream().distinct().count() != req.lessonIds().size()) {
            throw new IllegalArgumentException("Duplicate lesson ids in reorder request");
        }

        // Assign new order indices
        int order = 1;
        for (String id : req.lessonIds()) {
            Lesson lesson = lessons.findById(id).orElseThrow();
            lesson.setOrderIndex(order++);
            lessons.save(lesson);
        }

        return Map.of(
                "moduleId", moduleId,
                "reordered", req.lessonIds().size(),
                "message", "Lessons reordered successfully"
        );
    }

    public record ReorderRequest(List<String> lessonIds) {}
}
