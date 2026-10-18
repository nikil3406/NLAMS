'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Role } from '../../../../../db/schema/roles';
import type { AdministrativeUnit } from '../../../../../db/schema/administrative-units';
import type { UserWithDetails } from '../../../../repositories/user.repository';

export function CreateUserClient() {


  const [roles, setRoles] = useState<Role[]>([]);
  const [units, setUnits] = useState<AdministrativeUnit[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(true);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    user: UserWithDetails;
    temporaryPassword?: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Fetch delegatable roles and accessible administrative units
  useEffect(() => {
    async function fetchFormOptions() {
      setIsLoadingMetadata(true);
      try {
        const [rolesRes, unitsRes] = await Promise.all([
          fetch('/api/roles'),
          fetch('/api/administrative-units'),
        ]);

        if (rolesRes.ok) {
          const rolesJson = await rolesRes.json();
          if (rolesJson.success) {
            setRoles(rolesJson.data);
            if (rolesJson.data.length > 0) {
              setRoleId(rolesJson.data[0].id);
            }
          }
        }

        if (unitsRes.ok) {
          const unitsJson = await unitsRes.json();
          if (unitsJson.success) {
            setUnits(unitsJson.data);
            if (unitsJson.data.length > 0) {
              setUnitId(unitsJson.data[0].id);
            }
          }
        }
      } catch {
        setErrorMessage('Failed to load role and administrative unit choices.');
      } finally {
        setIsLoadingMetadata(false);
      }
    }

    fetchFormOptions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        roleId,
        administrativeUnitId: unitId,
      };

      if (!autoGeneratePassword && customPassword.trim()) {
        payload.password = customPassword.trim();
      }

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create user');
      }

      setCreatedResult({
        user: json.data,
        temporaryPassword: json.temporaryPassword,
      });
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred while creating user'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPassword = () => {
    if (createdResult?.temporaryPassword) {
      navigator.clipboard.writeText(createdResult.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2500);
    }
  };

  return (
    <div className="users-page" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header and Breadcrumbs */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
            <Link href="/users" style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              Users
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>New User</span>
          </div>
          <h1 className="page-title">Create User</h1>
          <p className="page-subtitle">
            Provision a new user account with initial role and administrative unit assignment.
          </p>
        </div>
      </div>

      {/* Success Modal / Display */}
      {createdResult && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#6ee7b7' }}>✓ User Successfully Created</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                User <strong style={{ color: '#fff' }}>{createdResult.user.name}</strong> ({createdResult.user.email}) has been provisioned and assigned to administrative hierarchy.
              </p>

              {createdResult.temporaryPassword ? (
                <div className="one-time-credential-box">
                  <div className="one-time-credential-title">
                    🔑 Temporary Initial Password
                  </div>
                  <div className="one-time-credential-value">
                    <span>{createdResult.temporaryPassword}</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}
                      onClick={handleCopyPassword}
                    >
                      {copiedPassword ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    Please securely provide this password to the officer. In development mode without an email relay, this password will not be displayed again.
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  User was created with the designated initial password.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <Link href="/users" className="btn-secondary">
                  Back to Users List
                </Link>
                <Link href={`/users/${createdResult.user.id}`} className="btn-primary">
                  View User Details →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert-error-banner" id="create-user-error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Card */}
      <div className="detail-panel-card" style={{ padding: '2rem' }}>
        {isLoadingMetadata ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading authorized roles and administrative hierarchy scopes...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="user-name">
                  Full Name <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  id="user-name"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-email">
                  Email Address <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <input
                  type="email"
                  id="user-email"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  required
                  placeholder="e.g. ramesh.kumar@nlams.gov.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="user-phone">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  id="user-phone"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  placeholder="e.g. +91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-role">
                  System Role <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <select
                  id="user-role"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  required
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.description}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Only roles you are authorized to delegate are listed.
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="user-unit">
                Administrative Unit Assignment <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                id="user-unit"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                required
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code}) — {u.type}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Assignment is restricted to units within your authorized administrative scope.
              </span>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={autoGeneratePassword}
                  onChange={(e) => setAutoGeneratePassword(e.target.checked)}
                />
                <span>Automatically generate a secure temporary password</span>
              </label>

              {!autoGeneratePassword && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label className="form-label" htmlFor="user-password">
                    Custom Initial Password
                  </label>
                  <input
                    type="password"
                    id="user-password"
                    className="search-input"
                    style={{ paddingLeft: '1rem' }}
                    minLength={8}
                    placeholder="Min 8 characters"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: 'none', padding: 0 }}>
              <Link href="/users" className="btn-cancel">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting}
                id="btn-submit-create-user"
              >
                {isSubmitting ? 'Creating User...' : 'Provision User'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
