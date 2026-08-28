package com.backendforge.academy.quiz;

import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class QuizService {

    private final QuizRepository quizRepo;
    private final QuizResultRepository resultRepo;

    public QuizService(QuizRepository quizRepo, QuizResultRepository resultRepo) {
        this.quizRepo = quizRepo;
        this.resultRepo = resultRepo;
    }

    public Optional<Quiz> getQuizByLessonId(String lessonId) {
        return quizRepo.findByLessonId(lessonId);
    }

    public Optional<Quiz> getQuizById(Long quizId) {
        return quizRepo.findById(quizId);
    }

    public QuizResult submitQuiz(Long userId, Long quizId, List<Integer> answers, int timeTakenSeconds) {
        Quiz quiz = quizRepo.findById(quizId)
                .orElseThrow(() -> new RuntimeException("Quiz not found"));

        List<QuizQuestion> questions = quiz.getQuestions();
        int correct = 0;

        for (int i = 0; i < questions.size() && i < answers.size(); i++) {
            QuizQuestion q = questions.get(i);
            if (answers.get(i) != null && answers.get(i) == q.getCorrectAnswerIndex()) {
                correct++;
            }
        }

        int total = questions.size();
        int score = total > 0 ? (correct * 100) / total : 0;
        boolean passed = score >= quiz.getPassingScore();

        QuizResult result = new QuizResult();
        result.setUserId(userId);
        result.setQuizId(quizId);
        result.setScore(score);
        result.setTotalQuestions(total);
        result.setCorrectAnswers(correct);
        result.setPassed(passed);
        result.setTimeTakenSeconds(timeTakenSeconds);
        result.setAnswersJson(answers.toString());

        return resultRepo.save(result);
    }

    public List<QuizResult> getUserResults(Long userId) {
        return resultRepo.findByUserIdOrderByCompletedAtDesc(userId);
    }

    public Optional<QuizResult> getBestResult(Long userId, Long quizId) {
        return resultRepo.findFirstByUserIdAndQuizIdOrderByCompletedAtDesc(userId, quizId);
    }

    public long getPassedQuizCount(Long userId) {
        return resultRepo.countByUserIdAndPassedTrue(userId);
    }

    public List<QuizResult> getPassedQuizzes(Long userId) {
        return resultRepo.findByUserIdAndPassedTrue(userId);
    }
}
