import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Certificate({ certificateCode }) {
  const { user } = useAuth();
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (certificateCode) {
      verifyCertificate();
    } else if (user) {
      loadUserCertificates();
    }
  }, [certificateCode, user]);

  const verifyCertificate = async () => {
    try {
      const response = await api.get(`/certificates/verify/${certificateCode}`);
      if (response.data.valid) {
        setCertificate(response.data);
      }
    } catch (err) {
      console.error('Failed to verify certificate:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserCertificates = async () => {
    try {
      const response = await api.get('/certificates');
      if (response.data.length > 0) {
        setCertificate(response.data[0]);
      }
    } catch (err) {
      console.error('Failed to load certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCertificateImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = 800;
    const height = 600;
    
    canvas.width = width;
    canvas.height = height;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#f4a261';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Inner border
    ctx.strokeStyle = '#e9c46a';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // Title
    ctx.fillStyle = '#f4a261';
    ctx.font = 'bold 36px serif';
    ctx.textAlign = 'center';
    ctx.fillText('Certificate of Completion', width / 2, 100);

    // Subtitle
    ctx.fillStyle = '#e9c46a';
    ctx.font = '18px sans-serif';
    ctx.fillText('BackendForge Academy', width / 2, 140);

    // Decorative line
    ctx.strokeStyle = '#f4a261';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(200, 160);
    ctx.lineTo(600, 160);
    ctx.stroke();

    // "This certifies that"
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.fillText('This certifies that', width / 2, 200);

    // Student name
    ctx.fillStyle = '#f4a261';
    ctx.font = 'bold 32px serif';
    ctx.fillText(certificate.userName, width / 2, 250);

    // "has successfully completed"
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.fillText('has successfully completed', width / 2, 300);

    // Course title
    ctx.fillStyle = '#e9c46a';
    ctx.font = 'bold 24px serif';
    ctx.fillText(certificate.courseTitle, width / 2, 350);

    // Stats
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `${certificate.completedLessons}/${certificate.totalLessons} Lessons • ${certificate.quizzesPassed} Quizzes Passed`,
      width / 2, 400
    );

    // Date
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `Issued: ${new Date(certificate.issuedAt).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      })}`,
      width / 2, 450
    );

    // Certificate code
    ctx.fillStyle = '#f4a261';
    ctx.font = '12px monospace';
    ctx.fillText(`Certificate ID: ${certificate.code}`, width / 2, 500);

    // Footer
    ctx.fillStyle = '#666666';
    ctx.font = '12px sans-serif';
    ctx.fillText('Verify at: backendforge.academy/certificates/verify', width / 2, 550);
  };

  const downloadCertificate = async () => {
    setDownloading(true);
    
    try {
      // Generate image
      generateCertificateImage();
      
      // Convert canvas to blob and download
      const canvas = canvasRef.current;
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BackendForge-Certificate-${certificate.code}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloading(false);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to download certificate:', err);
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="certificate-loading">Loading certificate...</div>;
  }

  if (!certificate) {
    return (
      <div className="no-certificate">
        <div className="icon">🏆</div>
        <h3>No Certificate Yet</h3>
        <p>Complete at least 80% of the curriculum to earn your certificate!</p>
      </div>
    );
  }

  return (
    <div className="certificate-container">
      <div className="certificate-preview">
        <canvas ref={canvasRef} className="certificate-canvas" />
      </div>
      
      <div className="certificate-actions">
        <button 
          className="btn primary"
          onClick={downloadCertificate}
          disabled={downloading}
        >
          {downloading ? '⏳ Generating...' : '📥 Download Certificate'}
        </button>
        
        <button 
          className="btn ghost"
          onClick={() => {
            const verifyUrl = `${window.location.origin}/certificates/verify/${certificate.code}`;
            navigator.clipboard.writeText(verifyUrl);
            alert('Verification link copied to clipboard!');
          }}
        >
          🔗 Copy Verification Link
        </button>
      </div>

      <div className="certificate-details">
        <div className="detail-row">
          <span className="label">Certificate ID:</span>
          <span className="value">{certificate.code}</span>
        </div>
        <div className="detail-row">
          <span className="label">Issued:</span>
          <span className="value">
            {new Date(certificate.issuedAt).toLocaleDateString('en-US', { 
              year: 'numeric', month: 'long', day: 'numeric' 
            })}
          </span>
        </div>
        <div className="detail-row">
          <span className="label">Progress:</span>
          <span className="value">
            {certificate.completedLessons}/{certificate.totalLessons} lessons completed
          </span>
        </div>
      </div>
    </div>
  );
}
