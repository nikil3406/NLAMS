'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectWithRelations } from '../../../../../repositories/project.repository';
import type { ImplementingAgency } from '../../../../../../db/schema/implementing-agencies';
import type { AdministrativeUnit } from '../../../../../../db/schema/administrative-units';
import { PROJECT_TYPES } from '../../../../../../db/schema/projects';

interface EditProjectClientProps {
  projectId: string;
  currentUserId: string;
}

export function EditProjectClient({ projectId }: EditProjectClientProps) {
  const router = useRouter();

  const [project, setProject] = useState<ProjectWithRelations | null>(null);

  // Form editable states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [implementingAgencyId, setImplementingAgencyId] = useState('');
  const [administrativeUnitId, setAdministrativeUnitId] = useState('');
  const [landAcquisitionRequired, setLandAcquisitionRequired] = useState(true);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');

  // Agency searchable dropdown state
  const [agencies, setAgencies] = useState<ImplementingAgency[]>([]);
  const [agencySearch, setAgencySearch] = useState('');
  const [isAgencyDropdownOpen, setIsAgencyDropdownOpen] = useState(false);

  // Administrative units state
  const [adminUnits, setAdminUnits] = useState<AdministrativeUnit[]>([]);

  // Status
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [projRes, agencyRes, unitsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch('/api/implementing-agencies?activeOnly=true&limit=100'),
        fetch('/api/administrative-units'),
      ]);

      if (!projRes.ok) {
        throw new Error('Failed to load project details.');
      }
      const projJson = await projRes.json();
      if (!projJson.success) {
        throw new Error(projJson.error || 'Failed to load project');
      }

      const p: ProjectWithRelations = projJson.data;
      if (p.status === 'COMPLETED' || p.status === 'CANCELLED') {
        throw new Error(`Project is in terminal status '${p.status}' and cannot be edited.`);
      }

      setProject(p);
      setName(p.name);
      setDescription(p.description || '');
      setProjectType(p.projectType);
      setImplementingAgencyId(p.implementingAgencyId);
      setAdministrativeUnitId(p.administrativeUnitId);
      setLandAcquisitionRequired(p.landAcquisitionRequired);
      setEstimatedCost(p.estimatedCost || '');
      setPlannedStartDate(p.plannedStartDate || '');
      setPlannedEndDate(p.plannedEndDate || '');

      if (agencyRes.ok) {
        const agencyJson = await agencyRes.json();
        if (agencyJson.success) setAgencies(agencyJson.data);
      }

      if (unitsRes.ok) {
        const unitsJson = await unitsRes.json();
        if (unitsJson.success) setAdminUnits(unitsJson.data);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while loading data'
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAgencies = agencies.filter((a) => {
    if (!agencySearch.trim()) return true;
    const term = agencySearch.toLowerCase();
    return a.name.toLowerCase().includes(term) || a.code.toLowerCase().includes(term);
  });

  const selectedAgency = agencies.find((a) => a.id === implementingAgencyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Project name is required');
      return;
    }

    if (plannedStartDate && plannedEndDate && new Date(plannedEndDate) < new Date(plannedStartDate)) {
      setErrorMessage('Planned end date cannot be earlier than planned start date');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        projectType,
        implementingAgencyId,
        administrativeUnitId,
        landAcquisitionRequired,
        estimatedCost: estimatedCost.trim() || null,
        plannedStartDate: plannedStartDate || null,
        plannedEndDate: plannedEndDate || null,
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update project');
      }

      router.push(`/projects/${projectId}`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred while updating project'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="users-page">
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading project for editing...</span>
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
        <Link href={`/projects/${projectId}`} className="btn-secondary">
          ← Return to Project Details
        </Link>
      </div>
    );
  }

  return (
    <div className="users-page" style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Header and Breadcrumbs */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
            <Link href="/projects" style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              Projects
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <Link href={`/projects/${projectId}`} style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              {project?.projectCode}
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>Edit</span>
          </div>
          <h1 className="page-title">Edit Project: {project?.projectCode}</h1>
          <p className="page-subtitle">
            Update project parameters within authorized administrative scope.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1.5rem' }}>
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
        <form onSubmit={handleSubmit} className="modal-form">
          {/* Immutable attributes notice */}
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.875rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Immutable attributes: Code (<strong>{project?.projectCode}</strong>), Status (<strong>{project?.status}</strong>). Status transitions must be performed on the project detail view.
          </div>

          {/* Project Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-project-name">
              Project Name <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <input
              type="text"
              id="edit-project-name"
              className="search-input"
              style={{ paddingLeft: '1rem' }}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-project-description">
              Project Description
            </label>
            <textarea
              id="edit-project-description"
              className="search-input"
              style={{ padding: '0.75rem 1rem', minHeight: '80px', resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Grid: Project Type & Land Acquisition */}
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-project-type">
                Project Type <span style={{ color: 'var(--status-danger)' }}>*</span>
              </label>
              <select
                id="edit-project-type"
                className="filter-select"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
              >
                {(PROJECT_TYPES as readonly string[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-land-acquisition-required">
                Land Acquisition Required
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="edit-land-acquisition-required"
                  checked={landAcquisitionRequired}
                  onChange={(e) => setLandAcquisitionRequired(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="edit-land-acquisition-required" style={{ fontSize: '0.875rem', color: '#fff', cursor: 'pointer' }}>
                  {landAcquisitionRequired ? 'Yes — Land acquisition required' : 'No — Existing government land'}
                </label>
              </div>
            </div>
          </div>

          {/* Implementing Agency Searchable Selector */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-agency-selector">
              Implementing Agency <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-input)',
                padding: '0.5rem 0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <input
                  type="text"
                  id="edit-agency-selector"
                  className="search-input"
                  style={{ border: 'none', background: 'transparent', padding: '0.25rem 0.5rem', width: '100%' }}
                  placeholder="Search active government agencies..."
                  value={agencySearch || (selectedAgency ? `${selectedAgency.name} (${selectedAgency.code})` : '')}
                  onFocus={() => {
                    setIsAgencyDropdownOpen(true);
                    setAgencySearch('');
                  }}
                  onChange={(e) => {
                    setAgencySearch(e.target.value);
                    setIsAgencyDropdownOpen(true);
                  }}
                />
                {selectedAgency && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => {
                      setImplementingAgencyId('');
                      setAgencySearch('');
                    }}
                    title="Clear selection"
                  >
                    ✕
                  </button>
                )}
              </div>

              {isAgencyDropdownOpen && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '0.5rem',
                  }}
                >
                  {filteredAgencies.map((agency) => (
                    <div
                      key={agency.id}
                      onClick={() => {
                        setImplementingAgencyId(agency.id);
                        setAgencySearch('');
                        setIsAgencyDropdownOpen(false);
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: agency.id === implementingAgencyId ? 'var(--accent-subtle)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: '0.8125rem', color: '#fff' }}>{agency.name}</span>
                      <span className="role-tag-badge">{agency.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Administrative Unit */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-admin-unit-select">
              Administrative Unit <span style={{ color: 'var(--status-danger)' }}>*</span>
            </label>
            <select
              id="edit-admin-unit-select"
              className="filter-select"
              value={administrativeUnitId}
              onChange={(e) => setAdministrativeUnitId(e.target.value)}
              required
            >
              {adminUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code}) — {u.type}
                </option>
              ))}
            </select>
          </div>

          {/* Estimated Cost */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-estimated-cost">
              Estimated Cost (INR ₹)
            </label>
            <input
              type="text"
              id="edit-estimated-cost"
              className="search-input"
              style={{ paddingLeft: '1rem' }}
              placeholder="e.g. 150000000.00"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
            />
          </div>

          {/* Planned Dates Grid */}
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="edit-planned-start-date">
                Planned Start Date
              </label>
              <input
                type="date"
                id="edit-planned-start-date"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                value={plannedStartDate}
                onChange={(e) => setPlannedStartDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-planned-end-date">
                Planned End Date
              </label>
              <input
                type="date"
                id="edit-planned-end-date"
                className="search-input"
                style={{ paddingLeft: '1rem' }}
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            <Link href={`/projects/${projectId}`} className="btn-cancel">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !name.trim()}
              id="btn-save-project-changes"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
