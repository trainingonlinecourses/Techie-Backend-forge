package com.backendforge.academy.quiz;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface QuizResultRepository extends JpaRepository<QuizResult, Long> {
    List<QuizResult> findByUserIdOrderByCompletedAtDesc(Long userId);
    Optional<QuizResult> findFirstByUserIdAndQuizIdOrderByCompletedAtDesc(Long userId, Long quizId);
    List<QuizResult> findByUserIdAndPassedTrue(Long userId);
    long countByUserIdAndPassedTrue(Long userId);
}
