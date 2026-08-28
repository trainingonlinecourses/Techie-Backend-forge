package com.backendforge.academy.quiz;

import jakarta.persistence.*;
import java.util.List;

@Entity
@Table(name = "quiz_questions")
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quiz_id", nullable = false)
    private Quiz quiz;

    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false, length = 1000)
    private String questionText;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private QuestionType questionType; // MULTIPLE_CHOICE, TRUE_FALSE, CODE_OUTPUT

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "quiz_options", joinColumns = @JoinColumn(name = "question_id"))
    @Column(name = "option_text")
    @OrderColumn(name = "option_index")
    private List<String> options;

    @Column(nullable = false)
    private int correctAnswerIndex; // 0-based index of correct option

    @Column(length = 2000)
    private String explanation; // shown after answering

    @Column(length = 2000)
    private String codeSnippet; // optional code snippet for the question

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Quiz getQuiz() { return quiz; }
    public void setQuiz(Quiz quiz) { this.quiz = quiz; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public String getQuestionText() { return questionText; }
    public void setQuestionText(String questionText) { this.questionText = questionText; }

    public QuestionType getQuestionType() { return questionType; }
    public void setQuestionType(QuestionType questionType) { this.questionType = questionType; }

    public List<String> getOptions() { return options; }
    public void setOptions(List<String> options) { this.options = options; }

    public int getCorrectAnswerIndex() { return correctAnswerIndex; }
    public void setCorrectAnswerIndex(int correctAnswerIndex) { this.correctAnswerIndex = correctAnswerIndex; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }

    public String getCodeSnippet() { return codeSnippet; }
    public void setCodeSnippet(String codeSnippet) { this.codeSnippet = codeSnippet; }

    public enum QuestionType {
        MULTIPLE_CHOICE,
        TRUE_FALSE,
        CODE_OUTPUT
    }
}
