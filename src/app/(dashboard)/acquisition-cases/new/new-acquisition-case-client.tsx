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
          throw new Error('Failed to load accessible projects');
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
      setFormError('Please select a project for this acquisition case.');
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
    <div className="users-page-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/acquisition-cases"
          style={{
            fontSize: '0.8125rem',
            color: '#94a3b8',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginBottom: '0.75rem',
            textDecoration: 'none',
          }}
        >
          ← Back to Acquisition Cases
        </Link>
        <h1 className="users-page-title">Initiate Acquisition Case</h1>
        <p className="users-page-subtitle">
          Establish the formal land acquisition file linked to an approved infrastructure project.
        </p>
      </div>

      {/* Information Banner */}
      <div
        style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          color: '#93c5fd',
          lineHeight: '1.5',
        }}
      >
        <strong>Workflow Stage 1: Draft Foundation</strong>
        <p style={{ marginTop: '0.25rem', color: '#bfdbfe', fontSize: '0.8125rem' }}>
          This action creates an acquisition case in <strong>DRAFT</strong> status. A unique concurrency-safe case reference
          will be assigned automatically. Once initialized, the case can be prepared and submitted for official review.
        </p>
      </div>

      {loadError && (
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <span>{loadError}</span>
        </div>
      )}

      {formError && (
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1.5rem' }} id="create-case-error">
          <span>{formError}</span>
        </div>
      )}

      {isLoadingProjects ? (
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading accessible projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state-card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p style={{ fontWeight: 600, color: '#fff' }}>No Accessible Projects</p>
          <p style={{ fontSize: '0.8125rem', maxWidth: '420px', margin: '0 auto' }}>
            No projects were found in your authorized administrative scope. An acquisition case must be linked to an existing project.
          </p>
          <Link href="/projects/new" className="btn-primary" style={{ marginTop: '1rem' }}>
            Create a Project First
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form-card" style={{ padding: '1.75rem', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Project Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="case-project-select"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem' }}
            >
              Linked Infrastructure Project <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="case-project-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="users-filter-select"
              style={{ width: '100%', height: '42px', padding: '0 0.75rem' }}
              required
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.projectCode}) — {p.administrativeUnit?.name} [{p.status}]
                </option>
              ))}
            </select>
            {selectedProject && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                }}
              >
                <span><strong>Agency:</strong> {selectedProject.implementingAgency?.name} ({selectedProject.implementingAgency?.code})</span>
                <span style={{ marginLeft: '1rem' }}><strong>Admin Unit:</strong> {selectedProject.administrativeUnit?.name} ({selectedProject.administrativeUnit?.code})</span>
              </div>
            )}
          </div>

          {/* Case Title */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="case-title-input"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem' }}
            >
              Case Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="case-title-input"
              type="text"
              placeholder="e.g. Land Acquisition for Bengaluru-Mysuru Expressway Section 2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="users-search-input"
              style={{ width: '100%', height: '42px', padding: '0 0.75rem' }}
              minLength={3}
              maxLength={255}
              required
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              htmlFor="case-desc-input"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem' }}
            >
              Description & Scope Details <span style={{ color: '#64748b', fontWeight: 400 }}>(Optional)</span>
            </label>
            <textarea
              id="case-desc-input"
              placeholder="Describe the initial acquisition requirement, affected villages, or special statutory directives..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="users-search-input"
              style={{ width: '100%', minHeight: '100px', padding: '0.75rem' }}
              maxLength={2000}
            />
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Link
              href="/acquisition-cases"
              className="btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              id="submit-create-case-btn"
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-sm" />
                  Creating Case Draft...
                </>
              ) : (
                'Create Draft Case'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
