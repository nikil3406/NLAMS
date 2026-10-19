'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ProjectWithRelations } from '../../../../repositories/project.repository';
import type { ProjectStatus } from '../../../../../db/schema/projects';

interface ProjectDetailsClientProps {
  projectId: string;
  currentUserId: string;
  userPermissions: string[];
  isSuperAdmin: boolean;
}

export function ProjectDetailsClient({
  projectId,
  userPermissions,
  isSuperAdmin,
}: ProjectDetailsClientProps) {

  const canUpdate = isSuperAdmin || userPermissions.includes('PROJECT_UPDATE');
  const canRegister = isSuperAdmin || userPermissions.includes('PROJECT_REGISTER');

  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Status transition modal state
  const [statusModalTarget, setStatusModalTarget] = useState<ProjectStatus | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const loadProject = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Project not found or outside your authorized administrative scope.');
        }
        if (res.status === 403) {
          throw new Error('You do not have permission to view this project.');
        }
        throw new Error('Failed to load project details.');
      }

      const json = await res.json();
      if (json.success) {
        setProject(json.data);
      } else {
        throw new Error(json.error || 'Failed to load project');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleRegister = async () => {
    if (!window.confirm('Formally register this project in NLAMS?')) {
      return;
    }

    setIsActionLoading(true);
    setErrorMessage(null);
    setActionSuccessMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/register`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to register project');
      }

      setProject(json.data);
      setActionSuccessMessage('Project formally registered in NLAMS successfully.');
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Registration failed'
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusTransition = async (targetStatus: ProjectStatus) => {
    setIsActionLoading(true);
    setErrorMessage(null);
    setActionSuccessMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          reason: statusReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to transition project status to ${targetStatus}`);
      }

      setProject(json.data);
      setStatusModalTarget(null);
      setStatusReason('');
      setActionSuccessMessage(`Project status transitioned to ${targetStatus} successfully.`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Status transition failed'
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'REGISTERED':
        return 'badge-status active';
      case 'DRAFT':
        return 'badge-status inactive';
      case 'ON_HOLD':
        return 'badge-status suspended';
      case 'COMPLETED':
        return 'badge-status active';
      case 'CANCELLED':
        return 'badge-status suspended';
      default:
        return 'badge-status inactive';
    }
  };

  const formatCurrency = (val: string | null | undefined) => {
    if (!val) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) {
    return (
      <div className="users-page">
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading project details...</span>
        </div>
      </div>
    );
  }

  if (errorMessage && !project) {
    return (
      <div className="users-page">
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
        <Link href="/projects" className="btn-secondary">
          ← Return to Projects
        </Link>
      </div>
    );
  }

  if (!project) return null;

  const isTerminal = project.status === 'COMPLETED' || project.status === 'CANCELLED';

  return (
    <div className="users-page project-details-page">
      {/* Header and Breadcrumbs */}
      <div className="page-header-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
            <Link href="/projects" style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              Projects
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span
              style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}
              title={project.projectCode}
            >
              {project.projectCode}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ wordBreak: 'break-word' }}>{project.name}</h1>
            <span className={getStatusBadgeClass(project.status)}>
              {project.status}
            </span>
          </div>
          <p
            className="page-subtitle"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-secondary)', wordBreak: 'break-all' }}
          >
            {project.projectCode}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="page-actions-group" style={{ flexShrink: 0 }}>
          {canUpdate && !isTerminal && (
            <Link
              href={`/projects/${project.id}/edit`}
              className="btn-secondary"
              id="btn-edit-project"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Edit Details</span>
            </Link>
          )}

          {/* Registration Action */}
          {project.status === 'DRAFT' && canRegister && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleRegister}
              disabled={isActionLoading}
              id="btn-register-project"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Register Project</span>
            </button>
          )}

          {/* Status Transitions */}
          {canUpdate && !isTerminal && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {project.status === 'DRAFT' && (
                <button
                  type="button"
                  className="btn-cancel"
                  style={{ color: 'var(--status-danger)' }}
                  onClick={() => setStatusModalTarget('CANCELLED')}
                  id="btn-cancel-project"
                >
                  Cancel Project
                </button>
              )}

              {project.status === 'REGISTERED' && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setStatusModalTarget('ON_HOLD')}
                    id="btn-hold-project"
                  >
                    Put On Hold
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ backgroundColor: 'var(--status-active)' }}
                    onClick={() => setStatusModalTarget('COMPLETED')}
                    id="btn-complete-project"
                  >
                    Mark Completed
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ color: 'var(--status-danger)' }}
                    onClick={() => setStatusModalTarget('CANCELLED')}
                    id="btn-cancel-project-reg"
                  >
                    Cancel Project
                  </button>
                </>
              )}

              {project.status === 'ON_HOLD' && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleStatusTransition('REGISTERED')}
                    id="btn-resume-project"
                  >
                    Resume (Registered)
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    style={{ color: 'var(--status-danger)' }}
                    onClick={() => setStatusModalTarget('CANCELLED')}
                    id="btn-cancel-project-hold"
                  >
                    Cancel Project
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Success / Error Notifications */}
      {actionSuccessMessage && (
        <div className="alert-banner-success" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert-banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Info Panels — consistent two-column layout */}
      <div className="project-details-grid">
        {/* Card: Infrastructure Details */}
        <div className="project-detail-card">
          <h2 className="project-card-heading">Infrastructure Details</h2>
          <div className="project-card-body">
            <div className="project-field">
              <span className="project-field-label">Description</span>
              <p className="project-field-value" style={{ lineHeight: '1.5' }}>
                {project.description || 'No description provided.'}
              </p>
            </div>
            <div className="project-field-row">
              <div className="project-field">
                <span className="project-field-label">Project Type</span>
                <span className="role-tag-badge" style={{ margin: 0 }}>{project.projectType}</span>
              </div>
              <div className="project-field">
                <span className="project-field-label">Land Acquisition</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: project.landAcquisitionRequired
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(100, 116, 139, 0.15)',
                    color: project.landAcquisitionRequired ? '#f87171' : 'var(--text-muted)',
                    fontWeight: 500,
                    display: 'inline-block',
                  }}
                >
                  {project.landAcquisitionRequired ? 'Required' : 'Not Required'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Implementing Agency */}
        <div className="project-detail-card">
          <h2 className="project-card-heading">Implementing Agency</h2>
          <div className="project-card-body">
            <div className="project-field">
              <span className="project-field-label">Agency Name</span>
              <strong style={{ color: '#fff', fontSize: '0.875rem', wordBreak: 'break-word' }}>
                {project.implementingAgency?.name ?? '—'}
              </strong>
            </div>
            <div className="project-field-row">
              <div className="project-field">
                <span className="project-field-label">Agency Code</span>
                <span className="role-tag-badge" style={{ margin: 0 }}>{project.implementingAgency?.code ?? '—'}</span>
              </div>
              <div className="project-field">
                <span className="project-field-label">Category</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  {project.implementingAgency?.agencyType?.replace('_', ' ') ?? '—'}
                </span>
              </div>
            </div>
            {project.implementingAgency?.officialWebsite && (
              <div className="project-field">
                <span className="project-field-label">Official Website</span>
                <a
                  href={project.implementingAgency.officialWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent-secondary)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8125rem',
                    wordBreak: 'break-all',
                  }}
                >
                  <span>{project.implementingAgency.officialWebsite}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            )}
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              Provenance: Verified against official public directory.
            </div>
          </div>
        </div>

        {/* Card: Administrative Unit */}
        <div className="project-detail-card">
          <h2 className="project-card-heading">Administrative Unit Scope</h2>
          <div className="project-card-body">
            <div className="project-field">
              <span className="project-field-label">Unit Name</span>
              <strong style={{ color: '#fff', fontSize: '0.875rem', wordBreak: 'break-word' }}>
                {project.administrativeUnit?.name ?? '—'}
              </strong>
            </div>
            <div className="project-field-row">
              <div className="project-field">
                <span className="project-field-label">Unit Code</span>
                <span className="role-tag-badge" style={{ margin: 0 }}>{project.administrativeUnit?.code ?? '—'}</span>
              </div>
              <div className="project-field">
                <span className="project-field-label">Hierarchy Level</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  {project.administrativeUnit?.type ?? '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Financials & Timeline */}
        <div className="project-detail-card">
          <h2 className="project-card-heading">Financials &amp; Timeline</h2>
          <div className="project-card-body">
            <div className="project-field">
              <span className="project-field-label">Estimated Cost</span>
              <span style={{ color: 'var(--status-active)', fontWeight: 600, fontSize: '1rem' }}>
                {formatCurrency(project.estimatedCost)}
              </span>
            </div>
            <div className="project-field-row">
              <div className="project-field">
                <span className="project-field-label">Planned Start</span>
                <span style={{ color: '#fff', fontSize: '0.8125rem' }}>
                  {project.plannedStartDate
                    ? new Date(project.plannedStartDate).toLocaleDateString('en-IN')
                    : '—'}
                </span>
              </div>
              <div className="project-field">
                <span className="project-field-label">Planned End</span>
                <span style={{ color: '#fff', fontSize: '0.8125rem' }}>
                  {project.plannedEndDate
                    ? new Date(project.plannedEndDate).toLocaleDateString('en-IN')
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Governance & Audit Trail — full width */}
        <div className="project-detail-card project-detail-card--full">
          <h2 className="project-card-heading">Governance &amp; Audit Trail</h2>
          <div className="project-audit-grid">
            <div className="project-field">
              <span className="project-field-label">Created By</span>
              <span style={{ color: '#fff', fontSize: '0.8125rem', wordBreak: 'break-word' }}>
                {project.creator?.name} ({project.creator?.email})
              </span>
            </div>
            <div className="project-field">
              <span className="project-field-label">Creation Timestamp</span>
              <span style={{ color: '#fff', fontSize: '0.8125rem' }}>
                {new Date(project.createdAt).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="project-field">
              <span className="project-field-label">Last Updated</span>
              <span style={{ color: '#fff', fontSize: '0.8125rem' }}>
                {new Date(project.updatedAt).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Transition Modal */}
      {statusModalTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Confirm Status Transition</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setStatusModalTarget(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Are you sure you want to transition this project from{' '}
                <strong style={{ color: '#fff' }}>{project.status}</strong> to{' '}
                <strong style={{ color: '#fff' }}>{statusModalTarget}</strong>?
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="transition-reason">
                  Reason / Remarks (Optional)
                </label>
                <textarea
                  id="transition-reason"
                  className="search-input"
                  style={{ padding: '0.5rem 0.75rem', minHeight: '60px' }}
                  placeholder="e.g. Administrative hold requested by authority..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setStatusModalTarget(null)}
                  disabled={isActionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleStatusTransition(statusModalTarget)}
                  disabled={isActionLoading}
                  id="btn-confirm-status-transition"
                >
                  {isActionLoading ? 'Updating...' : `Confirm ${statusModalTarget}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
