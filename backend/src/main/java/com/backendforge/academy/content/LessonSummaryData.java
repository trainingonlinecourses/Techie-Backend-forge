package com.backendforge.academy.content;

/**
 * Lightweight lesson projection for the curriculum tree and module lists —
 * deliberately excludes the markdown {@code body} and the {@code topics}/{@code docs}
 * collections so list endpoints stop hauling hundreds of KB per request.
 */
public record LessonSummaryData(String id, String moduleId, String title, String summary,
                                int order, int minutes, boolean capstone) {}
