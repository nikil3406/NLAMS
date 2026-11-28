'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectWithRelations } from '../../../../../repositories/project.repository';
import type { BoundaryRecord } from '../../../../../repositories/project-boundary.repository';
import type { ImplementingAgency } from '../../../../../../db/schema/implementing-agencies';
import type { AdministrativeUnit } from '../../../../../../db/schema/administrative-units';
import { PROJECT_TYPES } from '../../../../../../db/schema/projects';
import { ProjectBoundaryMap } from '../../../../../components/maps/project-boundary-map';
import type { GeoJsonGeometry } from '../../../../../validators/spatial/boundary.schema';

interface EditProjectClientProps {
  projectId: string;
  currentUserId: string;
}

export function EditProjectClient({ projectId, currentUserId }: EditProjectClientProps) {
  const router = useRouter();

  const [project, setProject] = useState<ProjectWithRelations | null>(null);

  // Section A – General Project Details States
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

  // Section B – Project Boundary States
  const [savedBoundary, setSavedBoundary] = useState<BoundaryRecord | null>(null);
  const [geometry, setGeometry] = useState<GeoJsonGeometry | null>(null);
  const [geometryAreaSqm, setGeometryAreaSqm] = useState<number>(0);
  const [estimatedLandArea, setEstimatedLandArea] = useState<string>('');
  const [estimatedAreaUnit, setEstimatedAreaUnit] = useState<string>('HECTARE');
  const [boundaryChangeReason, setBoundaryChangeReason] = useState<string>('');

  // Status States
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
      if (p.createdBy !== currentUserId) {
        throw new Error('Forbidden: Only the original project creator may edit project details.');
      }
      if (p.status !== 'DRAFT' && !p.correctionPendingFor) {
        throw new Error(
          `Project is in '${p.status}' status and cannot be edited. Editing is only permitted for DRAFT projects or during an active correction cycle.`
        );
      }
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

      // Load boundary data if present on project or fetch fallback
      let boundaryData: BoundaryRecord | null = p.boundary ?? null;
      if (!boundaryData) {
        try {
          const boundaryRes = await fetch(`/api/projects/${projectId}/boundary`);
          if (boundaryRes.ok) {
            const bJson = await boundaryRes.json();
            if (bJson.success && bJson.data) {
              boundaryData = bJson.data;
            }
          }
        } catch {
          // Boundary might not exist if none was drawn initially
        }
      }

      if (boundaryData) {
        setSavedBoundary(boundaryData);
        let geom: GeoJsonGeometry | null = (boundaryData.geometry as unknown) as GeoJsonGeometry | null;
        if (typeof boundaryData.geometry === 'string') {
          try {
            geom = JSON.parse(boundaryData.geometry);
          } catch {
            geom = null;
          }
        }
        setGeometry(geom);
        setEstimatedLandArea(boundaryData.estimatedLandArea || '');
        setEstimatedAreaUnit(boundaryData.estimatedAreaUnit || 'HECTARE');
        if (boundaryData.calculatedGeometryArea) {
          setGeometryAreaSqm(parseFloat(boundaryData.calculatedGeometryArea));
        }
      }

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
  }, [projectId, currentUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAgencies = agencies.filter((a) => {
    if (!agencySearch.trim()) return true;
    const term = agencySearch.toLowerCase();
    return a.name.toLowerCase().includes(term) || a.code.toLowerCase().includes(term);
  });

  const selectedAgency = agencies.find((a) => a.id === implementingAgencyId);
  const selectedAdminUnit = adminUnits.find((u) => u.id === administrativeUnitId);

  // Check if boundary was modified compared to persisted state
  const hasBoundaryChanged = (): boolean => {
    if (!savedBoundary) {
      return !!geometry;
    }
    if (!geometry) {
      return true;
    }
    if (JSON.stringify(savedBoundary.geometry) !== JSON.stringify(geometry)) {
      return true;
    }
    if (savedBoundary.estimatedLandArea !== estimatedLandArea.trim()) {
      return true;
    }
    if (savedBoundary.estimatedAreaUnit !== estimatedAreaUnit) {
      return true;
    }
    if (boundaryChangeReason.trim()) {
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Section A Validations
    if (!name.trim()) {
      setErrorMessage('Project name is required');
      return;
    }

    if (plannedStartDate && plannedEndDate && new Date(plannedEndDate) < new Date(plannedStartDate)) {
      setErrorMessage('Planned end date cannot be earlier than planned start date');
      return;
    }

    // Section B Validations (when land acquisition is required)
    const boundaryChanged = hasBoundaryChanged();
    if (landAcquisitionRequired) {
      if (!geometry) {
        setErrorMessage('Approximate project boundary polygon is required when land acquisition is required.');
        return;
      }
      if (!estimatedLandArea.trim() || isNaN(parseFloat(estimatedLandArea)) || parseFloat(estimatedLandArea) <= 0) {
        setErrorMessage('Please enter a valid estimated land area greater than 0.');
        return;
      }
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

      // Only attach boundary if boundary has changed or was newly drawn
      // This ensures general project updates without boundary edits do NOT erase or duplicate boundaries
      if (boundaryChanged && geometry) {
        payload.boundary = {
          geometry,
          estimatedLandArea: parseFloat(estimatedLandArea).toFixed(2),
          estimatedAreaUnit,
          changeReason: boundaryChangeReason.trim() || undefined,
        };
      }

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
    <div className="users-page" style={{ maxWidth: '880px', margin: '0 auto' }}>
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
            Update project parameters and approximate boundary within authorized administrative scope.
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

      <form onSubmit={handleSubmit} className="modal-form">
        {/* Immutable attributes notice */}
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.875rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          Immutable attributes: Code (<strong>{project?.projectCode}</strong>), Status (<strong>{project?.status}</strong>). Status transitions must be performed on the project detail view.
        </div>

        {/* ======================================================== */}
        {/* SECTION A: General Project Details                       */}
        {/* ======================================================== */}
        <div className="detail-panel-card" style={{ padding: '2rem', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
              A
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                Section A – General Project Details
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                Project identification, classification, ownership, and scheduling.
              </p>
            </div>
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
              Implementing Agency
            </label>
            <div
              id="edit-agency-readonly"
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                  {selectedAgency ? selectedAgency.name : project?.implementingAgency?.name || 'Assigned Agency'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Implementing Agency cannot be reassigned through ordinary project editing
                </div>
              </div>
              <span className="role-tag-badge">
                {selectedAgency ? selectedAgency.code : project?.implementingAgency?.code || 'AGENCY'}
              </span>
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
        </div>

        {/* ======================================================== */}
        {/* SECTION B: Project Boundary                              */}
        {/* ======================================================== */}
        <div className="detail-panel-card" style={{ padding: '2rem', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
              B
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                Section B – Project Boundary &amp; Land Requirement
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                View, modify, or redraw the approximate boundary polygon and DPR land requisition.
              </p>
            </div>
          </div>

          {/* Boundary Callout Notice */}
          <div
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <strong style={{ color: '#fff', fontSize: '0.875rem' }}>
                Boundary &amp; Land Requirement Definitions
              </strong>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <p style={{ marginBottom: '0.35rem' }}>
                • <strong>Approximate Project Boundary:</strong> Preliminary planning polygon representing the infrastructure right-of-way alignment. <span style={{ color: 'var(--status-warning)' }}>This is NOT an official cadastral parcel boundary.</span>
              </p>
              <p style={{ marginBottom: '0.35rem' }}>
                • <strong>Calculated Geometry Area:</strong> Spheroidal surface area computed from GIS polygon vertices via PostGIS.
              </p>
              <p>
                • <strong>Estimated Land Requirement:</strong> Official acquisition area requisitioned for the project DPR.
              </p>
            </div>
          </div>

          {/* Persisted Boundary Notice */}
          {savedBoundary && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ color: '#34d399' }}>
                ✓ Persisted boundary (Version {savedBoundary.versionNumber}) loaded. You can modify vertices, redraw, or retain as is.
              </span>
              {savedBoundary.calculatedGeometryArea && (
                <span style={{ color: 'var(--text-muted)' }}>
                  Calculated area: {parseFloat(savedBoundary.calculatedGeometryArea).toLocaleString('en-IN')} sq m
                </span>
              )}
            </div>
          )}

          {/* Interactive Map Component */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Approximate Project Boundary Polygon {landAcquisitionRequired && <span style={{ color: 'var(--status-danger)' }}>*</span>}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Pan, zoom, edit vertices, or redraw boundary
              </span>
            </label>

            <ProjectBoundaryMap
              initialGeometry={geometry}
              adminUnitCode={selectedAdminUnit?.code}
              onChange={(newGeom, area) => {
                setGeometry(newGeom);
                setGeometryAreaSqm(area);
                if (!estimatedLandArea && area > 0) {
                  const inUnit = estimatedAreaUnit === 'HECTARE' ? area / 10000 : area / 4046.8564224;
                  setEstimatedLandArea(inUnit.toFixed(2));
                }
              }}
            />
          </div>

          {/* Estimated Land Requirement Form Inputs */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginTop: '1rem',
            }}
          >
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}>
              Estimated Land Requirement
            </h3>

            <div className="form-grid-2">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="edit-estimated-land-area">
                  Estimated Land Area {landAcquisitionRequired && <span style={{ color: 'var(--status-danger)' }}>*</span>}
                </label>
                <input
                  type="text"
                  id="edit-estimated-land-area"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  required={landAcquisitionRequired}
                  placeholder="e.g. 15.50"
                  value={estimatedLandArea}
                  onChange={(e) => setEstimatedLandArea(e.target.value)}
                />
                <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Official estimated area required for acquisition.
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="edit-estimated-area-unit">
                  Area Unit <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <select
                  id="edit-estimated-area-unit"
                  className="filter-select"
                  value={estimatedAreaUnit}
                  onChange={(e) => setEstimatedAreaUnit(e.target.value)}
                >
                  <option value="HECTARE">Hectares (ha)</option>
                  <option value="ACRE">Acres (ac)</option>
                  <option value="SQ_M">Square Metres (sq m)</option>
                  <option value="SQ_KM">Square Kilometres (sq km)</option>
                </select>
                <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Controlled unit for official project requisition.
                </div>
              </div>
            </div>

            {geometryAreaSqm > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Calculated Geometry Area from drawn polygon: <strong style={{ color: 'var(--status-active)' }}>{geometryAreaSqm.toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq m</strong>
              </div>
            )}
          </div>

          {/* Boundary Change Reason Input */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" htmlFor="edit-boundary-change-reason">
              Boundary Change Reason (Optional)
            </label>
            <input
              type="text"
              id="edit-boundary-change-reason"
              className="search-input"
              style={{ paddingLeft: '1rem' }}
              placeholder="e.g. Alignment revised to bypass designated forest reserve"
              value={boundaryChangeReason}
              onChange={(e) => setBoundaryChangeReason(e.target.value)}
              maxLength={500}
            />
            <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              Provide justification for audit history if modifying the project boundary.
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
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
  );
}
