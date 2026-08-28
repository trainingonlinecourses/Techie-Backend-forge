package com.backendforge.academy.quiz;

import com.backendforge.academy.security.UserPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/quiz")
public class QuizController {

    private final QuizService quizService;

    public QuizController(QuizService quizService) {
        this.quizService = quizService;
    }

    /** Get quiz for a lesson (without correct answers). */
    @GetMapping("/lesson/{lessonId}")
    public ResponseEntity<?> getQuizByLesson(@PathVariable String lessonId) {
        return quizService.getQuizByLessonId(lessonId)
                .map(quiz -> ResponseEntity.ok((Object) toDto(quiz)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** Get quiz by ID. */
    @GetMapping("/{quizId}")
    public ResponseEntity<?> getQuiz(@PathVariable Long quizId) {
        return quizService.getQuizById(quizId)
                .map(quiz -> ResponseEntity.ok((Object) toDto(quiz)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** Submit quiz answers. */
    @PostMapping("/{quizId}/submit")
    public ResponseEntity<?> submitQuiz(
            @PathVariable Long quizId,
            @RequestBody SubmitRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {

        QuizResult result = quizService.submitQuiz(
                principal.user().getId(),
                quizId,
                request.answers(),
                request.timeTakenSeconds()
        );

        return ResponseEntity.ok(new SubmitResponse(
                result.getScore(),
                result.getCorrectAnswers(),
                result.getTotalQuestions(),
                result.isPassed(),
                result.getTimeTakenSeconds()
        ));
    }

    /** Get user's quiz history. */
    @GetMapping("/results")
    public List<QuizResultDto> getResults(@AuthenticationPrincipal UserPrincipal principal) {
        return quizService.getUserResults(principal.user().getId()).stream()
                .map(this::toResultDto)
                .toList();
    }

    /** Get best result for a specific quiz. */
    @GetMapping("/{quizId}/best")
    public ResponseEntity<?> getBestResult(
            @PathVariable Long quizId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return quizService.getBestResult(principal.user().getId(), quizId)
                .map(r -> ResponseEntity.ok((Object) toResultDto(r)))
                .orElse(ResponseEntity.ok((Object) Map.of("attempted", false)));
    }

    /** Quiz statistics for the user. */
    @GetMapping("/stats")
    public QuizStatsDto getStats(@AuthenticationPrincipal UserPrincipal principal) {
        long passed = quizService.getPassedQuizCount(principal.user().getId());
        List<QuizResult> results = quizService.getUserResults(principal.user().getId());
        double avgScore = results.stream().mapToInt(QuizResult::getScore).average().orElse(0);

        return new QuizStatsDto(passed, results.size(), (int) avgScore);
    }

    // DTOs (without correct answers for client)
    private QuizDto toDto(Quiz quiz) {
        List<QuizQuestionDto> questions = quiz.getQuestions().stream()
                .map(q -> new QuizQuestionDto(
                        q.getId(),
                        q.getOrderIndex(),
                        q.getQuestionText(),
                        q.getQuestionType().name(),
                        q.getOptions(),
                        q.getCodeSnippet(),
                        q.getExplanation()
                ))
                .toList();

        return new QuizDto(
                quiz.getId(),
                quiz.getLessonId(),
                quiz.getTitle(),
                quiz.getDescription(),
                quiz.getPassingScore(),
                quiz.getTimeLimitMinutes(),
                questions
        );
    }

    private QuizResultDto toResultDto(QuizResult r) {
        return new QuizResultDto(
                r.getId(),
                r.getQuizId(),
                r.getScore(),
                r.getCorrectAnswers(),
                r.getTotalQuestions(),
                r.isPassed(),
                r.getCompletedAt().toString(),
                r.getTimeTakenSeconds()
        );
    }

    // Records
    public record SubmitRequest(List<Integer> answers, int timeTakenSeconds) {}

    public record SubmitResponse(int score, int correctAnswers, int totalQuestions,
                                  boolean passed, int timeTakenSeconds) {}

    public record QuizDto(Long id, String lessonId, String title, String description,
                           int passingScore, int timeLimitMinutes,
                           List<QuizQuestionDto> questions) {}

    public record QuizQuestionDto(Long id, int orderIndex, String questionText,
                                   String questionType, List<String> options,
                                   String codeSnippet, String explanation) {}

    public record QuizResultDto(Long id, Long quizId, int score, int correctAnswers,
                                 int totalQuestions, boolean passed,
                                 String completedAt, int timeTakenSeconds) {}

    public record QuizStatsDto(long passedQuizzes, long totalAttempts, int averageScore) {}
}
