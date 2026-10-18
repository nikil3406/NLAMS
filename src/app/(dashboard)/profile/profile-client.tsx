'use client';

import React, { useState } from 'react';
import type { SafeUser } from '../../../types/auth';
import type { AdministrativeAssignmentInfo } from '../../../types/authorization';

interface ProfileClientProps {
  user: SafeUser;
  roles: string[];
  assignments: AdministrativeAssignmentInfo[];
}

export function ProfileClient({ user, roles, assignments }: ProfileClientProps) {
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDirty =
    name.trim() !== (user.name ?? '') ||
    email.trim() !== (user.email ?? '') ||
    phone.trim() !== (user.phone ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const payload: Record<string, string> = {};
      if (name.trim()) payload.name = name.trim();
      if (email.trim()) payload.email = email.trim();
      if (phone.trim()) payload.phone = phone.trim();

      const res = await fetch('/api/users/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to update profile');
      }

      setSuccessMessage('Profile updated successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const initials = (user.name ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">
            Manage your personal contact details. Roles and unit assignments are managed by your administrator.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="alert-success" role="alert" id="profile-success-alert">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="alert-error" role="alert" id="profile-error-alert">
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* ── Left: Editable Personal Information ── */}
        <div className="user-sub-card">
          {/* Avatar + name banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: '3.25rem',
                height: '3.25rem',
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, var(--accent-primary), #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.125rem',
                color: '#fff',
                flexShrink: 0,
                letterSpacing: '0.02em',
              }}
              aria-label={`Avatar for ${user.name}`}
            >
              {initials}
            </div>
            <div>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                {user.name}
              </p>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  margin: 0,
                  marginTop: '0.125rem',
                }}
              >
                {user.email}
              </p>
            </div>
          </div>

          <div className="card-header-flex" style={{ marginBottom: '1.25rem' }}>
            <div>
              <h3 className="card-heading-title">Personal Information</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Only you can edit your name, email, and phone number.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} id="profile-edit-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-name">
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                maxLength={150}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-email">
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.gov.in"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-phone">
                Phone Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                maxLength={20}
              />
            </div>

            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'rgba(99,102,241,0.07)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(99,102,241,0.15)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--text-secondary)' }}>Note:</strong>{' '}
              Administrators cannot alter your personal details. Your account status,
              roles, and jurisdictional assignments are managed exclusively by
              authorised administrators.
            </div>

            <div className="modal-footer" style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={handleReset}
                disabled={!isDirty || isSaving}
                id="btn-profile-reset"
              >
                Discard Changes
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!isDirty || isSaving}
                id="btn-profile-save"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Right: Read-only Account Summary ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Account Status */}
          <div className="user-sub-card">
            <h3 className="card-heading-title" style={{ marginBottom: '1rem' }}>
              Account Status
            </h3>
            <div className="items-list-group">
              <div className="item-row-card">
                <div className="item-row-info">
                  <span className="item-row-subtitle">System Status</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    <span
                      className={`badge-status ${
                        user.status === 'ACTIVE'
                          ? 'active'
                          : user.status === 'SUSPENDED'
                          ? 'suspended'
                          : 'inactive'
                      }`}
                    >
                      {user.status}
                    </span>
                  </div>
                </div>
              </div>

              {user.createdAt && (
                <div className="item-row-card">
                  <div className="item-row-info">
                    <span className="item-row-subtitle">Account Created</span>
                    <span className="item-row-title" style={{ marginTop: '0.25rem' }}>
                      {new Date(user.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: '0.875rem',
                lineHeight: 1.5,
              }}
            >
              Account status is managed by your administrator and cannot be self-modified.
            </p>
          </div>

          {/* Assigned Roles */}
          <div className="user-sub-card">
            <h3 className="card-heading-title" style={{ marginBottom: '0.25rem' }}>
              Assigned Roles
            </h3>
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
              }}
            >
              System roles that determine your feature access and delegated authority.
            </p>

            {roles.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No roles currently assigned.
              </p>
            ) : (
              <div className="items-list-group">
                {roles.map((role) => (
                  <div
                    key={role}
                    className="item-row-card"
                    id={`profile-role-${role}`}
                  >
                    <div className="item-row-info">
                      <span className="item-row-title">
                        {role.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Administrative Assignments */}
          <div className="user-sub-card">
            <h3 className="card-heading-title" style={{ marginBottom: '0.25rem' }}>
              Administrative Assignments
            </h3>
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
              }}
            >
              Jurisdictional units you are authorised to oversee.
            </p>

            {assignments.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No administrative unit assignments found.
              </p>
            ) : (
              <div className="items-list-group">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="item-row-card"
                    id={`profile-assignment-${a.id}`}
                  >
                    <div className="item-row-info">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <span className="item-row-title">
                          {a.administrativeUnitName}
                        </span>
                        <span
                          className={`badge-status ${
                            a.status === 'ACTIVE' ? 'active' : 'inactive'
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                      <span className="item-row-subtitle">
                        Code: {a.administrativeUnitCode} &bull; Type:{' '}
                        {a.administrativeUnitType}
                      </span>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {a.startDate}
                        {a.endDate ? ` \u2192 ${a.endDate}` : ' (Current)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
