package com.backendforge.academy.content;

import com.backendforge.academy.content.ContentDtos.*;
import com.backendforge.academy.progress.ProgressService;
import com.backendforge.academy.security.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Public curriculum API. Reading content requires no authentication,
 * so the platform is instantly explorable; progress is per-user on top.
 */
@RestController
@RequestMapping("/api/content")
public class ContentController {

    private final ContentService content;
    private final DocsIndexService docsIndex;
    private final ProgressService progress;

    public ContentController(ContentService content, DocsIndexService docsIndex, ProgressService progress) {
        this.content = content;
        this.docsIndex = docsIndex;
        this.progress = progress;
    }

    @GetMapping("/modules")
    public List<ModuleDto> modules() {
        return content.modules();
    }

    @GetMapping("/modules/{id}")
    public ModuleDetail module(@PathVariable String id) {
        ModuleDto module = content.module(id);
        return new ModuleDetail(module, content.lessons(id));
    }

    @GetMapping("/lessons/{id}")
    public LessonDto lesson(@PathVariable String id) {
        return content.lesson(id);
    }

    @GetMapping("/search")
    public List<SearchResultDto> search(@RequestParam("q") String q) {
        return content.search(q);
    }

    /** The whole curriculum in one call — modules + lessons (used by the SPA sidebar/home). */
    @GetMapping("/curriculum")
    public List<CurriculumModule> curriculum() {
        return content.modules().stream()
                .map(m -> new CurriculumModule(m, content.lessons(m.id())))
                .toList();
    }

    @GetMapping("/docs")
    public List<DocsSectionDto> docs() {
        return docsIndex.sections();
    }

    @GetMapping("/stats")
    public StatsDto stats(@AuthenticationPrincipal UserPrincipal principal) {
        long completed = principal == null ? 0 : progress.completedCount(principal.user().getId());
        long total = content.modules().stream().mapToLong(ModuleDto::lessonCount).sum();
        return content.stats(completed, total, docsIndex.count());
    }

    /** A module plus its ordered lessons (for the module landing page). */
    public record ModuleDetail(ModuleDto module, List<LessonSummaryDto> lessons) {}

    /** A module plus its ordered lessons (for the curriculum tree). */
    public record CurriculumModule(ModuleDto module, List<LessonSummaryDto> lessons) {}
}
