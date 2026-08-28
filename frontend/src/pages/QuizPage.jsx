import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Quiz from '../components/Quiz';

export default function QuizPage() {
  const { lessonId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadLesson();
  }, [lessonId, user]);

  const loadLesson = async () => {
    try {
      const response = await api.get(`/content/lessons/${lessonId}`);
      setLesson(response.data);
    } catch (err) {
      console.error('Failed to load lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page-loading">Loading quiz...</div>;
  }

  if (!lesson) {
    return <div className="page-loading">Lesson not found</div>;
  }

  return (
    <div className="page quiz-page">
      <div className="pagehead">
        <div className="crumbs">
          <span>Academy</span>
          <span className="sep">/</span>
          <span>{lesson.lesson.moduleTitle}</span>
          <span className="sep">/</span>
          <span>{lesson.lesson.title}</span>
          <span className="sep">/</span>
          <span>Quiz</span>
        </div>
        <h1>📝 Quiz: {lesson.lesson.title}</h1>
      </div>

      <div className="quiz-page-content">
        <Quiz 
          lessonId={lessonId} 
          onComplete={(result) => {
            if (result.passed) {
              // Could redirect to certificate or next lesson
            }
          }}
        />
      </div>
    </div>
  );
}
