'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ImplementingAgency } from '../../../../../db/schema/implementing-agencies';
import type { AdministrativeUnit } from '../../../../../db/schema/administrative-units';
import { PROJECT_TYPES } from '../../../../../db/schema/projects';
import { ProjectBoundaryMap } from '../../../../components/maps/project-boundary-map';
import type { GeoJsonGeometry } from '../../../../validators/spatial/boundary.schema';

export function CreateProjectClient() {
  const router = useRouter();

  // Wizard Step: 1 = Basic Details, 2 = Location & Boundary
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Step 1: Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [implementingAgencyId, setImplementingAgencyId] = useState('');
  const [administrativeUnitId, setAdministrativeUnitId] = useState('');
  const [landAcquisitionRequired, setLandAcquisitionRequired] = useState(true);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');

  // Step 2: Location & Spatial states
  const [geometry, setGeometry] = useState<GeoJsonGeometry | null>(null);
  const [geometryAreaSqm, setGeometryAreaSqm] = useState<number>(0);
  const [estimatedLandArea, setEstimatedLandArea] = useState<string>('');
  const [estimatedAreaUnit, setEstimatedAreaUnit] = useState<string>('HECTARE');

  // Agency searchable dropdown state
  const [agencies, setAgencies] = useState<ImplementingAgency[]>([]);
  const [agencySearch, setAgencySearch] = useState('');
  const [isAgencyDropdownOpen, setIsAgencyDropdownOpen] = useState(false);

  // Administrative units state
  const [adminUnits, setAdminUnits] = useState<AdministrativeUnit[]>([]);

  // Page status
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch agencies and administrative units
  useEffect(() => {
    async function fetchMetadata() {
      setIsLoadingMetadata(true);
      try {
        const [agencyRes, unitsRes] = await Promise.all([
          fetch('/api/implementing-agencies?activeOnly=true&limit=100'),
          fetch('/api/administrative-units'),
        ]);

        if (agencyRes.ok) {
          const agencyJson = await agencyRes.json();
          if (agencyJson.success) {
            setAgencies(agencyJson.data);
          }
        }

        if (unitsRes.ok) {
          const unitsJson = await unitsRes.json();
          if (unitsJson.success) {
            setAdminUnits(unitsJson.data);
            if (unitsJson.data.length > 0) {
              setAdministrativeUnitId(unitsJson.data[0].id);
            }
          }
        }
      } catch {
        setErrorMessage('Failed to load initial metadata. Please refresh the page.');
      } finally {
        setIsLoadingMetadata(false);
      }
    }

    fetchMetadata();
  }, []);

  const filteredAgencies = agencies.filter((a) => {
    if (!agencySearch.trim()) return true;
    const term = agencySearch.toLowerCase();
    return a.name.toLowerCase().includes(term) || a.code.toLowerCase().includes(term);
  });

  const selectedAgency = agencies.find((a) => a.id === implementingAgencyId);
  const selectedAdminUnit = adminUnits.find((u) => u.id === administrativeUnitId);

  // Validation before advancing to step 2
  const validateStep1 = (): boolean => {
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage('Project name is required');
      return false;
    }
    if (!implementingAgencyId) {
      setErrorMessage('Please select a valid implementing agency');
      return false;
    }
    if (!administrativeUnitId) {
      setErrorMessage('Please select an administrative unit');
      return false;
    }
    if (plannedStartDate && plannedEndDate && new Date(plannedEndDate) < new Date(plannedStartDate)) {
      setErrorMessage('Planned end date cannot be earlier than planned start date');
      return false;
    }
    return true;
  };

  const handleNextToLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToDetails = () => {
    setErrorMessage(null);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }

    // If land acquisition is required, validate boundary and requirement
    if (landAcquisitionRequired) {
      if (!geometry) {
        setErrorMessage('Please draw an approximate project boundary polygon on the map.');
        return;
      }
      if (!estimatedLandArea.trim() || isNaN(Number(estimatedLandArea)) || Number(estimatedLandArea) <= 0) {
        setErrorMessage('Please enter a valid positive estimated land requirement value.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        projectType,
        implementingAgencyId,
        administrativeUnitId,
        landAcquisitionRequired,
      };

      if (estimatedCost.trim()) {
        payload.estimatedCost = estimatedCost.trim();
      }

      if (plannedStartDate) {
        payload.plannedStartDate = plannedStartDate;
      }

      if (plannedEndDate) {
        payload.plannedEndDate = plannedEndDate;
      }

      // If boundary is specified, include it in transactional payload
      if (geometry && estimatedLandArea.trim()) {
        payload.boundary = {
          geometry,
          estimatedLandArea: estimatedLandArea.trim(),
          estimatedAreaUnit,
          changeReason: 'Initial project boundary',
        };
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create project');
      }

      router.push(`/projects/${json.data.id}`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred while creating project'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="users-page" style={{ maxWidth: '880px', margin: '0 auto' }}>
      {/* Breadcrumbs and Header */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
            <Link href="/projects" style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              Projects
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>Create Project</span>
          </div>
          <h1 className="page-title">Create New Infrastructure Project</h1>
          <p className="page-subtitle">
            Initiate a public infrastructure or land acquisition project in DRAFT status.
          </p>
        </div>
      </div>

      {/* Stepper Indicator */}
      <div
        className="form-stepper-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'transparent',
            border: 'none',
            color: currentStep === 1 ? 'var(--accent-secondary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: currentStep === 1 ? 600 : 400,
            fontSize: '0.875rem',
          }}
        >
          <span
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: currentStep === 1 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            1
          </span>
          <span>Project Details</span>
        </button>

        <span style={{ color: 'var(--border-color)', fontSize: '1.25rem' }}>→</span>

        <button
          type="button"
          onClick={() => {
            if (validateStep1()) setCurrentStep(2);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'transparent',
            border: 'none',
            color: currentStep === 2 ? 'var(--accent-secondary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: currentStep === 2 ? 600 : 400,
            fontSize: '0.875rem',
          }}
        >
          <span
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: currentStep === 2 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            2
          </span>
          <span>Location &amp; Spatial Boundary</span>
        </button>
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

      {/* Step Container Card */}
      <div className="detail-panel-card" style={{ padding: '2rem' }}>
        {isLoadingMetadata ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading active implementing agencies and administrative units...</span>
          </div>
        ) : (
          <form onSubmit={currentStep === 1 ? handleNextToLocation : handleSubmit} className="modal-form">
            {/* STEP 1: Basic Project Details */}
            {currentStep === 1 && (
              <>
                {/* Project Name */}
                <div className="form-group">
                  <label className="form-label" htmlFor="project-name">
                    Project Name <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    id="project-name"
                    className="search-input"
                    style={{ paddingLeft: '1rem' }}
                    required
                    placeholder="e.g. Bengaluru-Mysuru Expressway Expansion Phase 2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="form-group">
                  <label className="form-label" htmlFor="project-description">
                    Project Description
                  </label>
                  <textarea
                    id="project-description"
                    className="search-input"
                    style={{ padding: '0.75rem 1rem', minHeight: '80px', resize: 'vertical' }}
                    placeholder="Brief outline of public infrastructure scope, objectives, and alignments..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* Grid: Project Type & Land Acquisition */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="project-type">
                      Project Type <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <select
                      id="project-type"
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
                    <label className="form-label" htmlFor="land-acquisition-required">
                      Land Acquisition Required
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', gap: '0.75rem' }}>
                      <input
                        type="checkbox"
                        id="land-acquisition-required"
                        checked={landAcquisitionRequired}
                        onChange={(e) => setLandAcquisitionRequired(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <label htmlFor="land-acquisition-required" style={{ fontSize: '0.875rem', color: '#fff', cursor: 'pointer' }}>
                        {landAcquisitionRequired ? 'Yes — Land acquisition required' : 'No — Existing government land'}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Implementing Agency Searchable Selector */}
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label" htmlFor="agency-selector">
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
                        id="agency-selector"
                        className="search-input"
                        style={{ border: 'none', background: 'transparent', padding: '0.25rem 0.5rem', width: '100%' }}
                        placeholder="Search active government agencies by name or code..."
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
                          maxHeight: '220px',
                          overflowY: 'auto',
                          borderTop: '1px solid var(--border-subtle)',
                          paddingTop: '0.5rem',
                        }}
                      >
                        {filteredAgencies.length === 0 ? (
                          <div style={{ padding: '0.75rem', fontSize: '0.8125rem', color: 'var(--status-warning)' }} id="agency-missing-notice">
                            The implementing agency is not currently available in NLAMS. Please contact the authorized administrator.
                          </div>
                        ) : (
                          filteredAgencies.map((agency) => (
                            <div
                              key={agency.id}
                              id={`agency-option-${agency.code}`}
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
                                transition: 'background-color 0.1s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  agency.id === implementingAgencyId ? 'var(--accent-subtle)' : 'transparent';
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fff' }}>
                                  {agency.name}
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                  Type: {agency.agencyType.replace('_', ' ')}
                                </div>
                              </div>
                              <span className="role-tag-badge">{agency.code}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedAgency && (
                    <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--status-active)' }}>
                      Selected: <strong>{selectedAgency.name}</strong> ({selectedAgency.code})
                    </div>
                  )}
                </div>

                {/* Administrative Unit Selector */}
                <div className="form-group">
                  <label className="form-label" htmlFor="admin-unit-select">
                    Administrative Unit <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <select
                    id="admin-unit-select"
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
                  <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    Loaded dynamically from administrative hierarchy. Scope will be verified by the server.
                  </div>
                </div>

                {/* Estimated Cost */}
                <div className="form-group">
                  <label className="form-label" htmlFor="estimated-cost">
                    Estimated Cost (INR ₹)
                  </label>
                  <input
                    type="text"
                    id="estimated-cost"
                    className="search-input"
                    style={{ paddingLeft: '1rem' }}
                    placeholder="e.g. 150000000.00"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                  />
                  <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    Stored with exact 2-decimal precision (e.g. 50000000.00).
                  </div>
                </div>

                {/* Planned Dates Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="planned-start-date">
                      Planned Start Date
                    </label>
                    <input
                      type="date"
                      id="planned-start-date"
                      className="search-input"
                      style={{ paddingLeft: '1rem' }}
                      value={plannedStartDate}
                      onChange={(e) => setPlannedStartDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="planned-end-date">
                      Planned End Date
                    </label>
                    <input
                      type="date"
                      id="planned-end-date"
                      className="search-input"
                      style={{ paddingLeft: '1rem' }}
                      value={plannedEndDate}
                      onChange={(e) => setPlannedEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Step 1 Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <Link href="/projects" className="btn-cancel">
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!name.trim() || !implementingAgencyId || !administrativeUnitId}
                    id="btn-next-step"
                  >
                    <span>Next: Project Location &amp; Boundary →</span>
                  </button>
                </div>
              </>
            )}

            {/* STEP 2: Project Location & Boundary */}
            {currentStep === 2 && (
              <>
                {/* Clarification Callout Notice */}
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
                      • <strong>Calculated Geometry Area:</strong> The spheroidal surface area computed from the GIS polygon vertices via PostGIS.
                    </p>
                    <p>
                      • <strong>Estimated Land Requirement:</strong> The official acquisition area requisitioned for the project Detailed Project Report (DPR).
                    </p>
                  </div>
                </div>

                {/* Interactive Map Component */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      Approximate Project Boundary Polygon {landAcquisitionRequired && <span style={{ color: 'var(--status-danger)' }}>*</span>}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Pan, zoom, and draw polygon coordinates
                    </span>
                  </label>

                  <ProjectBoundaryMap
                    initialGeometry={geometry}
                    adminUnitCode={selectedAdminUnit?.code}
                    onChange={(newGeom, area) => {
                      setGeometry(newGeom);
                      setGeometryAreaSqm(area);
                      // If estimatedLandArea is not set, optionally suggest initial value in selected unit
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
                      <label className="form-label" htmlFor="estimated-land-area">
                        Estimated Land Area {landAcquisitionRequired && <span style={{ color: 'var(--status-danger)' }}>*</span>}
                      </label>
                      <input
                        type="text"
                        id="estimated-land-area"
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
                      <label className="form-label" htmlFor="estimated-area-unit">
                        Area Unit <span style={{ color: 'var(--status-danger)' }}>*</span>
                      </label>
                      <select
                        id="estimated-area-unit"
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

                {/* Step 2 Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleBackToDetails}
                    id="btn-back-step"
                  >
                    <span>← Back to Project Details</span>
                  </button>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Link href="/projects" className="btn-cancel">
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isSubmitting || (landAcquisitionRequired && (!geometry || !estimatedLandArea.trim()))}
                      id="btn-submit-create-project"
                    >
                      {isSubmitting ? 'Creating Project & Persisting Boundary...' : 'Create Project'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
