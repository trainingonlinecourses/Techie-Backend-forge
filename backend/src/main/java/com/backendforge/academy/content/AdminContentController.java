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
     */
    @PutMapping("/modules/{moduleId}/reorder")
    public Map<String, Object> reorder(@PathVariable String moduleId,
                                       @RequestBody ReorderRequest req) {
        List<Lesson> moduleLessons = lessons.findByModuleIdOrderByOrderIndexAsc(moduleId);

        // Validate all IDs belong to this module
        var validIds = moduleLessons.stream().map(Lesson::getId).toList();
        for (String id : req.lessonIds()) {
            if (!validIds.contains(id)) {
                throw new IllegalArgumentException(
                        "Lesson " + id + " does not belong to module " + moduleId);
            }
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
