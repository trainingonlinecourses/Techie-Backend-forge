import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function MobileBottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const path = location.pathname;

  const isActive = (prefix) => path === prefix || path.startsWith(prefix + '/');

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile navigation">
      <Link to="/" className={`mbn-item ${path === '/' ? 'active' : ''}`}>
        <span className="mbn-icon">🏠</span>
        <span className="mbn-label">Home</span>
      </Link>
      <Link to="/modules/java" className={`mbn-item ${isActive('/modules') ? 'active' : ''}`}>
        <span className="mbn-icon">📚</span>
        <span className="mbn-label">Modules</span>
      </Link>
      <Link to="/chat" className={`mbn-item ${isActive('/chat') ? 'active' : ''}`}>
        <span className="mbn-icon">✦</span>
        <span className="mbn-label">AI Tutor</span>
      </Link>
      <Link to="/progress" className={`mbn-item ${isActive('/progress') ? 'active' : ''}`}>
        <span className="mbn-icon">📊</span>
        <span className="mbn-label">Progress</span>
      </Link>
      {user ? (
        <Link to="/certificates" className={`mbn-item ${isActive('/certificates') ? 'active' : ''}`}>
          <span className="mbn-icon">🏆</span>
          <span className="mbn-label">Awards</span>
        </Link>
      ) : (
        <Link to="/login" className={`mbn-item ${isActive('/login') ? 'active' : ''}`}>
          <span className="mbn-icon">👤</span>
          <span className="mbn-label">Sign In</span>
        </Link>
      )}
    </nav>
  );
}
