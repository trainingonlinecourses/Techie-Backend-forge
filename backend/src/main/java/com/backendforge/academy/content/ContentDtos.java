package com.backendforge.academy.content;

import java.util.List;

public final class ContentDtos {

    private ContentDtos() {}

    public record ModuleDto(String id, String title, String subtitle, int order, String color,
                            List<String> tech, String docsUrl, long lessonCount, long minutes) {
        public static ModuleDto from(Module m, long lessonCount, long minutes) {
            return new ModuleDto(m.getId(), m.getTitle(), m.getSubtitle(), m.getOrderIndex(),
                    m.getColor(), m.getTech(), m.getDocsUrl(), lessonCount, minutes);
        }
    }

    public record LessonSummaryDto(String id, String moduleId, String moduleTitle, String title,
                                   String summary, int order, int minutes, List<String> topics,
                                   boolean capstone) {
        public static LessonSummaryDto from(Lesson l, String moduleTitle) {
            return new LessonSummaryDto(l.getId(), l.getModuleId(), moduleTitle,
                    l.getTitle(), l.getSummary(), l.getOrderIndex(), l.getMinutes(),
                    l.getTopics(), l.isCapstone());
        }
    }

    public record LessonDto(LessonSummaryDto lesson, String body, List<String> docs) {
        public static LessonDto from(Lesson l, String moduleTitle) {
            return new LessonDto(LessonSummaryDto.from(l, moduleTitle), l.getBody(), l.getDocs());
        }
    }

    public record SearchResultDto(String lessonId, String moduleId, String moduleTitle, String title,
                                  String snippet, double score) {}

    /** A module plus its ordered lessons (for the curriculum tree). */
    public record CurriculumModule(ModuleDto module, List<LessonSummaryDto> lessons) {}

    public record StatsDto(long modules, long lessons, long minutes, long docsLinks,
                           long completedLessons, long totalLessons) {}

    public record DocsSectionDto(String title, List<DocsLinkDto> links) {}
    public record DocsLinkDto(String title, String url, String description) {}
}
