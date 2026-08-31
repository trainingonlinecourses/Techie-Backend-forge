import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api/client';
import { useAuth } from './context/AuthContext.jsx';
import { useProgress } from './hooks/useProgress.js';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Home from './pages/Home.jsx';
import ModulePage from './pages/ModulePage.jsx';
import LessonPage from './pages/LessonPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import DocsPage from './pages/DocsPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFound from './pages/NotFound.jsx';
import QuizPage from './pages/QuizPage.jsx';
import CertificatePage from './pages/CertificatePage.jsx';
import ProgressPage from './pages/ProgressPage.jsx';
import AdminReorderPage from './pages/AdminReorderPage.jsx';
import MobileBottomNav from './components/MobileBottomNav.jsx';
import './components/mobile.css';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { progress } = useProgress();
  const [apiDown, setApiDown] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  const location = window.location.pathname;
  useEffect(() => setDrawerOpen(false), [location]);

  // Probe the API once: if it's unreachable (e.g. static-only deployment without a
  // backend), show a banner so login/lessons/AI-tutor being unavailable is clear.
  useEffect(() => {
    api
      .get('/content/stats')
      .then((res) => {
        if (typeof res.data !== 'object' || res.data === null) throw new Error('not an API');
        setApiDown(false);
      })
      .catch(() => setApiDown(true));
  }, []);

  return (
    <div className="app">
      {apiDown && (
        <div className="apibanner">
          ⚠ Static preview — the Spring Boot API isn't connected, so sign-in, lessons,
          search and the AI tutor are unavailable here. Host the backend and set{' '}
          <code>VITE_API_URL</code> to make this site fully live (see README).
        </div>
      )}
      <Navbar onMenu={() => setDrawerOpen((v) => !v)} drawerOpen={drawerOpen} />
      <div className={`layout ${drawerOpen ? 'drawer-open' : ''}`} onClick={() => drawerOpen && setDrawerOpen(false)}>
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
        <Sidebar progress={progress} />
        <main id="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/modules/:moduleId" element={<ModulePage />} />
            <Route path="/lessons/:lessonId" element={<LessonPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route
              path="/chat"
              element={
                <Protected>
                  <ChatPage />
                </Protected>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/quiz/:lessonId" element={<QuizPage />} />
            <Route path="/certificates" element={<CertificatePage />} />
            <Route path="/certificates/verify/:code" element={<CertificatePage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/admin/reorder" element={<Protected><AdminReorderPage /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
