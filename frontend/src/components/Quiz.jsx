import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Quiz({ lessonId, onComplete }) {
  const { user } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showExplanations, setShowExplanations] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    loadQuiz();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lessonId]);

  useEffect(() => {
    if (quiz && quiz.timeLimitMinutes > 0 && !submitted) {
      setTimeLeft(quiz.timeLimitMinutes * 60);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quiz, submitted]);

  const loadQuiz = async () => {
    try {
      const response = await api.get(`/quiz/lesson/${lessonId}`);
      setQuiz(response.data);
    } catch (err) {
      console.log('No quiz available for this lesson');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionIndex, answerIndex) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmit = async () => {
    if (!user || submitted) return;

    try {
      const timeTaken = quiz.timeLimitMinutes > 0 
        ? (quiz.timeLimitMinutes * 60) - timeLeft 
        : 0;

      const response = await api.post(`/quiz/${quiz.id}/submit`, {
        answers: Object.values(answers),
        timeTakenSeconds: timeTaken
      });

      setResult(response.data);
      setSubmitted(true);
      setShowExplanations(true);
      
      if (onComplete) {
        onComplete(response.data);
      }
    } catch (err) {
      console.error('Failed to submit quiz:', err);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="quiz-loading">Loading quiz...</div>;
  }

  if (!quiz) {
    return null;
  }

  if (submitted && result) {
    return (
      <div className="quiz-result">
        <div className={`result-header ${result.passed ? 'passed' : 'failed'}`}>
          <div className="result-icon">{result.passed ? '🎉' : '📚'}</div>
          <h3>{result.passed ? 'Congratulations!' : 'Keep Learning!'}</h3>
          <p>{result.passed 
            ? 'You passed the quiz!' 
            : 'Review the material and try again.'}</p>
        </div>
        
        <div className="result-stats">
          <div className="stat">
            <span className="stat-value">{result.score}%</span>
            <span className="stat-label">Score</span>
          </div>
          <div className="stat">
            <span className="stat-value">{result.correctAnswers}/{result.totalQuestions}</span>
            <span className="stat-label">Correct</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatTime(result.timeTakenSeconds)}</span>
            <span className="stat-label">Time</span>
          </div>
        </div>

        {showExplanations && (
          <div className="quiz-explanations">
            <h4>Review Answers</h4>
            {quiz.questions.map((question, index) => (
              <div key={question.id} className="explanation-item">
                <div className="question-number">Question {index + 1}</div>
                <div className="question-text">{question.questionText}</div>
                {question.codeSnippet && (
                  <pre className="code-snippet">{question.codeSnippet}</pre>
                )}
                <div className="options">
                  {question.options.map((option, optIndex) => (
                    <div 
                      key={optIndex}
                      className={`option ${
                        answers[index] === optIndex ? 'user-selected' : ''
                      }`}
                    >
                      <span className="option-letter" style={{fontWeight: 'bold'}}>{String.fromCharCode(65 + optIndex)}.</span> {option}
                      {answers[index] === optIndex && <span className="selected-badge">← your answer</span>}
                    </div>
                  ))}
                </div>
                {question.explanation && (
                  <div className="explanation">
                    <strong>Explanation:</strong> {question.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button 
          className="btn primary"
          onClick={() => {
            setSubmitted(false);
            setResult(null);
            setAnswers({});
            setCurrentQuestion(0);
            setShowExplanations(false);
          }}
        >
          Retake Quiz
        </button>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];
  const totalQuestions = quiz.questions.length;
  const progress = ((currentQuestion + 1) / totalQuestions) * 100;

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h3>📝 Quiz: {quiz.title}</h3>
        <div className="quiz-meta">
          <span>{totalQuestions} questions</span>
          <span>Passing score: {quiz.passingScore}%</span>
          {quiz.timeLimitMinutes > 0 && (
            <span className={`timer ${timeLeft < 60 ? 'warning' : ''}`}>
              ⏱ {formatTime(timeLeft)}
            </span>
          )}
        </div>
      </div>

      <div className="quiz-progress">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
        <span className="progress-text">
          Question {currentQuestion + 1} of {totalQuestions}
        </span>
      </div>

      <div className="quiz-question">
        <div className="question-number">Question {currentQuestion + 1}</div>
        <div className="question-text">{question.questionText}</div>
        
        {question.codeSnippet && (
          <pre className="code-snippet">{question.codeSnippet}</pre>
        )}

        <div className="quiz-options">
          {question.options.map((option, index) => (
            <label 
              key={index}
              className={`quiz-option ${answers[currentQuestion] === index ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name={`question-${currentQuestion}`}
                checked={answers[currentQuestion] === index}
                onChange={() => handleAnswer(currentQuestion, index)}
              />
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              <span className="option-text">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="quiz-navigation">
        <button 
          className="btn ghost"
          onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
          disabled={currentQuestion === 0}
        >
          ← Previous
        </button>
        
        <div className="quiz-dots">
          {quiz.questions.map((_, index) => (
            <button
              key={index}
              className={`dot ${answers[index] !== undefined ? 'answered' : ''} ${index === currentQuestion ? 'active' : ''}`}
              onClick={() => setCurrentQuestion(index)}
            />
          ))}
        </div>

        {currentQuestion === totalQuestions - 1 ? (
          <button 
            className="btn primary"
            onClick={handleSubmit}
            disabled={Object.keys(answers).length < totalQuestions}
          >
            Submit Quiz
          </button>
        ) : (
          <button 
            className="btn primary"
            onClick={() => setCurrentQuestion(prev => Math.min(totalQuestions - 1, prev + 1))}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
