package com.backendforge.academy.content;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface LessonRepository extends JpaRepository<Lesson, String> {

    List<Lesson> findByModuleIdOrderByOrderIndexAsc(String moduleId);

    long countByModuleId(String moduleId);

    /** Sum of lesson minutes without loading bodies — used by /stats. */
    @Query("select coalesce(sum(l.minutes), 0) from Lesson l")
    long totalMinutes();

    /** Summary fields only (no body, no topics/docs collections) — the curriculum tree. */
    @Query("select new com.backendforge.academy.content.LessonSummaryData(" +
            "l.id, l.moduleId, l.title, l.summary, l.orderIndex, l.minutes, l.capstone) from Lesson l")
    List<LessonSummaryData> findAllSummaries();
}
