import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ProgressDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [quizStats, setQuizStats] = useState(null);
  const [certStatus, setCertStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    try {
      const [statsRes, activityRes, quizRes, certRes] = await Promise.all([
        api.get('/content/stats'),
        api.get('/progress/completed'),
        api.get('/quiz/stats'),
        api.get('/certificates/status')
      ]);

      setStats(statsRes.data);
      setRecentActivity(activityRes.data.slice(0, 10));
      setQuizStats(quizRes.data);
      setCertStatus(certRes.data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (!stats) {
    return <div className="dashboard-error">Failed to load dashboard</div>;
  }

  const completionPercentage = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;

  return (
    <div className="progress-dashboard">
      <h2>📊 Learning Dashboard</h2>
      
      {/* Main Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Lessons Completed</div>
          <div className="stat-sub">of {stats.total} total</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-value">{completionPercentage}%</div>
          <div className="stat-label">Overall Progress</div>
          <div className="stat-sub">Keep going!</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-value">{quizStats?.passedQuizzes || 0}</div>
          <div className="stat-label">Quizzes Passed</div>
          <div className="stat-sub">Average score: {quizStats?.averageScore || 0}%</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-value">{certStatus?.eligible ? '✓' : '—'}</div>
          <div className="stat-label">Certificate</div>
          <div className="stat-sub">
            {certStatus?.eligible 
              ? 'Eligible for certificate!' 
              : `${certStatus?.completionPercentage || 0}% / ${certStatus?.requiredPercentage || 80}% required`}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-section">
        <h3>Course Progress</h3>
        <div className="progress-bar-large">
          <div 
            className="progress-fill" 
            style={{ width: `${completionPercentage}%` }}
          />
          <span className="progress-text">{completionPercentage}% Complete</span>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h3>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <p className="no-activity">No lessons completed yet. Start learning!</p>
        ) : (
          <div className="activity-list">
            {recentActivity.map((lesson, index) => (
              <div key={index} className="activity-item">
                <span className="activity-icon">✓</span>
                <span className="activity-text">{lesson.title}</span>
                <span className="activity-module">{lesson.moduleTitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Certificate Section */}
      {certStatus?.certificates?.length > 0 && (
        <div className="certificate-section">
          <h3>🏆 Your Certificates</h3>
          {certStatus.certificates.map((cert, index) => (
            <div key={index} className="certificate-card">
              <div className="cert-badge">🎓</div>
              <div className="cert-info">
                <div className="cert-code">{cert.code}</div>
                <div className="cert-date">Issued: {new Date(cert.issuedAt).toLocaleDateString()}</div>
                <div className="cert-progress">
                  {cert.completedLessons}/{cert.totalLessons} lessons • {cert.quizzesPassed} quizzes
                </div>
              </div>
              <button 
                className="btn small"
                onClick={() => window.open(`/certificates/verify/${cert.code}`, '_blank')}
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
