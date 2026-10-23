'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectWithRelations } from '../../../../repositories/project.repository';

interface NewAcquisitionCaseClientProps {
  currentUserId: string;
  userPermissions: string[];
  isSuperAdmin: boolean;
}

export function NewAcquisitionCaseClient({}: NewAcquisitionCaseClientProps) {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccessibleProjects() {
      setIsLoadingProjects(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/projects?limit=100');
        if (!res.ok) {
          throw new Error('Failed to load accessible projects in your administrative scope');
        }
        const json = await res.json();
        if (json.success) {
          setProjects(json.data);
          if (json.data.length > 0) {
            setSelectedProjectId(json.data[0].id);
          }
        } else {
          throw new Error(json.error || 'Failed to load projects');
        }
      } catch (err: unknown) {
        setLoadError(
          err instanceof Error ? err.message : 'An error occurred loading projects'
        );
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadAccessibleProjects();
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedProjectId) {
      setFormError('Please select an infrastructure project for this acquisition case.');
      return;
    }

    if (title.trim().length < 3) {
      setFormError('Case title must be at least 3 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/acquisition-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create acquisition case');
      }

      router.push(`/acquisition-cases/${json.data.id}`);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header and Breadcrumb */}
      <div>
        <Link
          href="/acquisition-cases"
          style={{
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginBottom: '0.75rem',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          ← Back to Acquisition Cases
        </Link>
        <h1 className="page-title">Initiate Acquisition Case</h1>
        <p className="page-subtitle" style={{ marginTop: '0.375rem' }}>
          Establish the formal land acquisition file linked to an approved infrastructure project within your authorized administrative scope.
        </p>
      </div>

      {/* Workflow Explanatory Notice */}
      <div
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent-secondary, #60a5fa)"
          strokeWidth="2"
          style={{ flexShrink: 0, marginTop: '2px' }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: '#fff', display: 'block', marginBottom: '0.25rem' }}>
            Workflow Stage 1: Case Draft Foundation
          </strong>
          This action creates an acquisition case in <strong style={{ color: '#93c5fd' }}>DRAFT</strong> status. A unique concurrency-safe case reference is assigned automatically. The case references the linked project directly without duplicate geometry. Once initialized, the case can be prepared and submitted for official review.
        </div>
      </div>

      {loadError && (
        <div className="alert-banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{loadError}</span>
        </div>
      )}

      {formError && (
        <div className="alert-banner-error" role="alert" id="create-case-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      {isLoadingProjects ? (
        <div className="empty-state-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
          <span className="spinner-sm" />
          <span>Loading accessible projects in your administrative scope...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>No Accessible Projects</p>
          <p style={{ fontSize: '0.8125rem', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
            No projects were found in your authorized administrative scope. An acquisition case must be linked to an existing project.
          </p>
          <Link href="/projects/new" className="btn-primary" style={{ marginTop: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create a Project First
          </Link>
        </div>
      ) : (
        <div
          className="detail-panel-card"
          style={{
            padding: '2rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Project Selection */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                htmlFor="case-project-select"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span>Linked Infrastructure Project</span>
                <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                id="case-project-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="filter-select"
                style={{
                  height: '42px',
                  padding: '0 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  width: '100%',
                }}
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.projectCode}) — {p.administrativeUnit?.name} [{p.status}]
                  </option>
                ))}
              </select>

              {/* Subdued Project Summary Card */}
              {selectedProject && (
                <div
                  style={{
                    marginTop: '0.25rem',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '0.875rem 1rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.875rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', fontWeight: 700 }}>
                      Implementing Agency
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '2px', display: 'block', wordBreak: 'break-word', lineHeight: 1.35 }}>
                      {selectedProject.implementingAgency?.name} ({selectedProject.implementingAgency?.code})
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', fontWeight: 700 }}>
                      Administrative Scope
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '2px', display: 'block', wordBreak: 'break-word', lineHeight: 1.35 }}>
                      {selectedProject.administrativeUnit?.name}{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        ({selectedProject.administrativeUnit?.code} • {selectedProject.administrativeUnit?.type})
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Case Title */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                htmlFor="case-title-input"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span>Case Title</span>
                <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <input
                id="case-title-input"
                type="text"
                placeholder="e.g. Land Acquisition for Bengaluru-Mysuru Expressway Section 2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="search-input"
                style={{
                  height: '42px',
                  padding: '0 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  width: '100%',
                }}
                minLength={3}
                maxLength={255}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Enter a descriptive title identifying the acquisition stretch, section, or statutory purpose.
              </span>
            </div>

            {/* Description & Scope Details */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                htmlFor="case-desc-input"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>Description &amp; Scope Details</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 400 }}>
                  (Optional)
                </span>
              </label>
              <textarea
                id="case-desc-input"
                placeholder="Describe preliminary land requirements, affected taluks/villages, or special statutory instructions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="search-input"
                style={{
                  minHeight: '120px',
                  padding: '0.75rem 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  width: '100%',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
                maxLength={2000}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Maximum 2,000 characters. Specific individual affected parcels will be verified in subsequent field verification stages.
              </span>
            </div>

            {/* Form Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.75rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid var(--border-subtle)',
                marginTop: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/acquisition-cases"
                className="btn-cancel"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !selectedProjectId}
                className="btn-primary"
                id="submit-create-case-btn"
                style={{ minWidth: '160px', justifyContent: 'center' }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-sm" />
                    <span>Creating Case Draft...</span>
                  </>
                ) : (
                  'Create Draft Case'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
