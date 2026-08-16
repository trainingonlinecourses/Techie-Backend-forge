package com.backendforge.academy.content;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LessonRepository extends JpaRepository<Lesson, String> {

    List<Lesson> findByModuleIdOrderByOrderIndexAsc(String moduleId);

    long countByModuleId(String moduleId);
}
