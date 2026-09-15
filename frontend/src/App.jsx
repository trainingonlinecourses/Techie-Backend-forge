import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { api } from './api/client';
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
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import LabPage from './pages/LabPage.jsx';
import NotFound from './pages/NotFound.jsx';
import QuizPage from './pages/QuizPage.jsx';
import CertificatePage from './pages/CertificatePage.jsx';
import ProgressPage from './pages/ProgressPage.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import AdminReorderPage from './pages/AdminReorderPage.jsx';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage.jsx';
import SecureRouter from './components/SecureRouter.jsx';
import MobileBottomNav from './components/MobileBottomNav.jsx';
import './components/mobile.css';

export default function App() {
  const { progress } = useProgress();
  const [apiDown, setApiDown] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  const location = window.location.pathname;
  useEffect(() => setDrawerOpen(false), [location]);

  // Probe the API once so a static-only deployment (no backend configured) can show a
  // clear banner. We use a long timeout so a sleeping backend (Render free tier) does
  // not trigger a false "API not connected" banner during development.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Patient probe: a cold-starting Render instance can take 45-60s to answer.
    // 8s gave up mid-wake-up and made the site look broken; the wake-and-retry
    // interceptor only retries idempotent GETs, so give the probe one patient
    // attempt through the wake-up window.
    const timer = setTimeout(() => controller.abort(), 75000);
    api
      .get('/content/stats', { signal: controller.signal, timeout: 75000 })
      .catch((err) => {
        if (cancelled) return;
        // A network error or timeout in development (e.g. the Render free tier is
        // asleep) is NOT the same as "no API configured at all" — the proxy is
        // working, the backend just needs a wake-up ping. Only show the static-only
        // banner when the response is actually HTML (Vercel rewrote /api/* to
        // index.html) or the request was a clear 404 from a static deploy.
        const isClearlyStatic =
          err?.response?.data != null &&
          typeof err.response.data === 'string' &&
          err.response.data.startsWith('<!DOCTYPE');
        if (isClearlyStatic) {
          setApiDown(true);
        } else {
          // Leave apiDown false (no banner) — the backend may just be asleep or
          // slow; the login/lesson pages already show their own graceful errors.
          setApiDown(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route
              path="/chat"
              element={
                <SecureRouter>
                  <ChatPage />
                </SecureRouter>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/settings" element={<SecureRouter><SettingsPage /></SecureRouter>} />
            <Route path="/quiz/:lessonId" element={<QuizPage />} />
            <Route path="/certificates" element={<CertificatePage />} />
            <Route path="/certificates/verify/:code" element={<CertificatePage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/lab" element={<SecureRouter><LabPage /></SecureRouter>} />
            <Route path="/admin/reorder" element={<SecureRouter><AdminReorderPage /></SecureRouter>} />
            <Route path="/admin/analytics" element={<SecureRouter><AdminAnalyticsPage /></SecureRouter>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
