package com.backendforge.academy.content;

import java.util.List;

public final class ContentDtos {

    private ContentDtos() {}

    public record ModuleDto(String id, String title, String subtitle, int order, String color,
                            String level, String version, List<String> tech, String docsUrl,
                            long lessonCount, long minutes) {
        public static ModuleDto from(Module m, long lessonCount, long minutes) {
            return new ModuleDto(m.getId(), m.getTitle(), m.getSubtitle(), m.getOrderIndex(),
                    m.getColor(), m.getLevel(), versionFromId(m.getId()), m.getTech(), m.getDocsUrl(),
                    lessonCount, minutes);
        }

        /**
         * The Java release a module teaches, when it is a release module —
         * "java" → "Java SE", "java-8" → "Java 8", "java-22-24" → "Java 22–24".
         * Non-release modules (topics, Spring, tools) have no version chip.
         */
        static String versionFromId(String id) {
            if (id == null) return null;
            if (id.equals("java")) return "Java SE";
            var m = java.util.regex.Pattern.compile("^java-(\\d+(?:-\\d+)?)$").matcher(id);
            return m.matches() ? "Java " + m.group(1).replace('-', '–') : null;
        }
    }

    public record LessonSummaryDto(String id, String moduleId, String moduleTitle, String title,
                                   String summary, int order, int minutes, List<String> topics,
                                   boolean capstone, String version) {
        public static LessonSummaryDto from(Lesson l, String moduleTitle) {
            return new LessonSummaryDto(l.getId(), l.getModuleId(), moduleTitle,
                    l.getTitle(), l.getSummary(), l.getOrderIndex(), l.getMinutes(),
                    l.getTopics(), l.isCapstone(), ModuleDto.versionFromId(l.getModuleId()));
        }

        /** Summary-tree variant — no body and no topics/docs collections in the payload. */
        public static LessonSummaryDto from(LessonSummaryData d, String moduleTitle) {
            return new LessonSummaryDto(d.id(), d.moduleId(), moduleTitle, d.title(), d.summary(),
                    d.order(), d.minutes(), List.of(), d.capstone(),
                    ModuleDto.versionFromId(d.moduleId()));
        }
    }

    public record LessonDto(LessonSummaryDto lesson, String body, List<String> docs) {
        public static LessonDto from(Lesson l, String moduleTitle) {
            return new LessonDto(LessonSummaryDto.from(l, moduleTitle), l.getBody(), l.getDocs());
        }
    }

    public record SearchResultDto(String lessonId, String moduleId, String moduleTitle, String title,
                                  String snippet, double score, List<String> topics) {}

    /** A module plus its ordered lessons (for the curriculum tree). */
    public record CurriculumModule(ModuleDto module, List<LessonSummaryDto> lessons) {}

    public record StatsDto(long modules, long lessons, long minutes, long docsLinks,
                           long completedLessons, long totalLessons) {}

    public record DocsSectionDto(String title, List<DocsLinkDto> links) {}
    public record DocsLinkDto(String title, String url, String description) {}
}
