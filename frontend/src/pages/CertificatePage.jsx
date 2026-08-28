import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Certificate from '../components/Certificate';

export default function CertificatePage() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code && !user) {
      navigate('/login');
      return;
    }
    loadStatus();
  }, [code, user]);

  const loadStatus = async () => {
    try {
      if (!code && user) {
        const response = await api.get('/certificates/status');
        setStatus(response.data);
      }
    } catch (err) {
      console.error('Failed to load certificate status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const response = await api.post('/certificates/generate');
      if (response.data.id) {
        setStatus(prev => ({
          ...prev,
          certificates: [response.data, ...(prev?.certificates || [])]
        }));
        alert('Certificate generated successfully!');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate certificate');
    }
  };

  if (loading) {
    return <div className="page-loading">Loading certificate...</div>;
  }

  // Public verification view
  if (code) {
    return (
      <div className="page certificate-page">
        <div className="pagehead">
          <h1>🏆 Certificate Verification</h1>
        </div>
        <Certificate certificateCode={code} />
      </div>
    );
  }

  // User's certificate dashboard
  return (
    <div className="page certificate-page">
      <div className="pagehead">
        <h1>🏆 Your Certificates</h1>
      </div>

      <div className="certificate-dashboard">
        {/* Eligibility Status */}
        <div className="eligibility-card">
          <div className="eligibility-status">
            {status?.eligible ? (
              <>
                <div className="status-icon">✅</div>
                <h3>You're Eligible!</h3>
                <p>Complete at least 80% of the curriculum to earn your certificate.</p>
                <button className="btn primary" onClick={handleGenerate}>
                  Generate Certificate
                </button>
              </>
            ) : (
              <>
                <div className="status-icon">📊</div>
                <h3>Keep Learning!</h3>
                <p>
                  You've completed {status?.completionPercentage || 0}% of the curriculum.
                  <br />
                  You need {status?.requiredPercentage || 80}% to earn a certificate.
                </p>
                <div className="progress-bar-mini">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${status?.completionPercentage || 0}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Existing Certificates */}
        {status?.certificates?.length > 0 && (
          <div className="existing-certificates">
            <h3>Your Certificates</h3>
            {status.certificates.map((cert, index) => (
              <Certificate key={index} certificateCode={cert.code} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
