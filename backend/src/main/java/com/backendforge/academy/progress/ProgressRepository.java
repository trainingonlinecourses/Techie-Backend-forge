package com.backendforge.academy.progress;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProgressRepository extends JpaRepository<ProgressEntry, Long> {

    List<ProgressEntry> findByUserIdOrderByCompletedAtAsc(Long userId);

    Optional<ProgressEntry> findByUserIdAndLessonId(Long userId, String lessonId);

    boolean existsByUserIdAndLessonId(Long userId, String lessonId);

    long countByUserId(Long userId);

    void deleteByUserIdAndLessonId(Long userId, String lessonId);
}
