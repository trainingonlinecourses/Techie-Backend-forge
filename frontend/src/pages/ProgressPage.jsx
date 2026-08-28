import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import ProgressDashboard from '../components/ProgressDashboard';

export default function ProgressPage() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="page progress-page">
      <ProgressDashboard />
    </div>
  );
}
