import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page">
      <div className="call warn">
        <div className="ct">404 — Not found</div>
        <p>That page doesn't exist in the academy. Head back to the dashboard.</p>
      </div>
      <Link to="/" className="btn primary">Back to dashboard</Link>
    </div>
  );
}
