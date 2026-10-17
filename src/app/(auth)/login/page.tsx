'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setIsLoading(true);

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
      .then(async (response) => {
        let data: { success?: boolean; error?: string } = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }

        if (!response.ok || !data.success) {
          setError(data.error || 'Authentication failed. Please check your credentials.');
          setIsLoading(false);
          return;
        }

        // Navigate to dashboard with full page refresh to ensure session cookie is attached to server layout
        window.location.href = '/dashboard';
      })
      .catch((err: unknown) => {
        console.error('Login error:', err);
        setError('An unexpected connection error occurred. Please try again.');
        setIsLoading(false);
      });
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-card">
        {/* National Crest / Header Badge */}
        <div className="login-emblem-header">
          <div className="login-tricolor-strip" aria-hidden="true">
            <span className="strip-saffron" />
            <span className="strip-white" />
            <span className="strip-green" />
          </div>
          <span className="portal-subheading">GOVERNMENT OF INDIA</span>
          <h1 className="portal-heading">NLAMS</h1>
          <p className="portal-description">
            National Land Acquisition Management System
          </p>
        </div>

        <div className="login-divider" />

        <div className="login-form-header">
          <h2 className="login-title">Officer Authentication</h2>
          <p className="login-subtitle">
            Enter your official credentials to access the administrative portal
          </p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <svg
              className="alert-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Official Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="form-input"
              placeholder="admin@nlams.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            id="login-submit-btn"
            className="login-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-loading-state">
                <span className="spinner" />
                <span>Authenticating...</span>
              </span>
            ) : (
              <span>Sign In to NLAMS</span>
            )}
          </button>
        </form>

        <div className="login-notice-box">
          <p className="notice-text">
            <strong>Restricted Access:</strong> This system is reserved exclusively for
            authorized land acquisition and administrative officers. Unauthorized access is
            prohibited and punishable under applicable laws.
          </p>
        </div>
      </div>
    </div>
  );
}
