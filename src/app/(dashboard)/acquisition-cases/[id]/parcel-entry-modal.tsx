'use client';

import React, { useState } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import { convertAreaToSqm } from '../../../../lib/geo-utils';

interface ParcelEntryModalProps {
  caseId: string;
  defaultState?: string;
  defaultDistrict?: string;
  onClose: () => void;
  onSuccess: (newParcel: CaseParcelWithDetails) => void;
}

const AREA_UNITS = [
  { value: 'SQ_M', label: 'Square Meters (sq m)' },
  { value: 'HECTARE', label: 'Hectares (ha)' },
  { value: 'ACRE', label: 'Acres (ac)' },
  { value: 'SQ_KM', label: 'Square Kilometers (sq km)' },
];

const LAND_USE_OPTIONS = [
  'Agricultural (Dry Land)',
  'Agricultural (Wet / Irrigated)',
  'Agricultural (Garden / Plantation)',
  'Residential',
  'Commercial',
  'Industrial',
  'Forest / Woodland',
  'Barren / Waste Land',
  'Public / Community / Government',
  'Mixed Land Use',
  'Other',
];

export function ParcelEntryModal({
  caseId,
  defaultState = 'Karnataka',
  defaultDistrict = '',
  onClose,
  onSuccess,
}: ParcelEntryModalProps) {
  // Mode toggle: New canonical parcel vs Link existing
  const [entryMode, setEntryMode] = useState<'NEW' | 'EXISTING'>('NEW');

  // Existing parcel mode fields
  const [existingParcelId, setExistingParcelId] = useState('');

  // Section A: Land identification
  const [stateName, setStateName] = useState(defaultState);
  const [district, setDistrict] = useState(defaultDistrict);
  const [taluk, setTaluk] = useState('');
  const [village, setVillage] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  const [subdivisionNumber, setSubdivisionNumber] = useState('');
  const [landRecordReference, setLandRecordReference] = useState('');
  const [customParcelId, setCustomParcelId] = useState('');

  // Section B: Area details
  const [totalArea, setTotalArea] = useState('');
  const [areaUnit, setAreaUnit] = useState('SQ_M');
  const [proposedAffectedArea, setProposedAffectedArea] = useState('');
  const [affectedAreaUnit, setAffectedAreaUnit] = useState('SQ_M');

  // Section C: Physical land details
  const [landUse, setLandUse] = useState('Agricultural (Dry Land)');
  const [structuresPresent, setStructuresPresent] = useState('');
  const [treesCropsPresent, setTreesCropsPresent] = useState('');
  const [accessObservations, setAccessObservations] = useState('');
  const [physicalNotes, setPhysicalNotes] = useState('');

  // Section D: Location and spatial references
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [surveySketchRef, setSurveySketchRef] = useState('');

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Area validation calculation
  const totalSqm = convertAreaToSqm(Number(totalArea), areaUnit);
  const proposedSqm = convertAreaToSqm(Number(proposedAffectedArea), affectedAreaUnit);
  const isAreaExceeded =
    entryMode === 'NEW' &&
    !isNaN(totalSqm) &&
    !isNaN(proposedSqm) &&
    Number(totalArea) > 0 &&
    Number(proposedAffectedArea) > 0 &&
    proposedSqm > totalSqm + 1e-4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsedProposed = parseFloat(proposedAffectedArea);
    if (isNaN(parsedProposed) || parsedProposed <= 0) {
      setErrorMessage('Proposed affected area must be a positive number');
      return;
    }

    if (entryMode === 'EXISTING') {
      if (!existingParcelId.trim()) {
        setErrorMessage('Parcel ID or UUID is required');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/acquisition-cases/${caseId}/parcels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parcelId: existingParcelId.trim(),
            proposedAffectedArea: parsedProposed,
            affectedAreaUnit,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to associate parcel with acquisition case');
        }

        onSuccess(json.data);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'An error occurred associating the parcel'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // New parcel mode validation
    if (!stateName.trim()) {
      setErrorMessage('State is required');
      return;
    }
    if (!district.trim()) {
      setErrorMessage('District is required');
      return;
    }
    if (!taluk.trim()) {
      setErrorMessage('Taluk is required');
      return;
    }
    if (!village.trim()) {
      setErrorMessage('Village is required');
      return;
    }
    if (!surveyNumber.trim()) {
      setErrorMessage('Survey number is required');
      return;
    }

    const parsedTotal = parseFloat(totalArea);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      setErrorMessage('Total parcel area must be a positive number');
      return;
    }

    if (isAreaExceeded) {
      setErrorMessage(
        `Proposed affected area (${proposedAffectedArea} ${affectedAreaUnit}) cannot exceed the recorded total parcel area (${totalArea} ${areaUnit})`
      );
      return;
    }

    // Compile physical description
    const descParts: string[] = [];
    if (structuresPresent.trim()) {
      descParts.push(`Structures: ${structuresPresent.trim()}`);
    }
    if (treesCropsPresent.trim()) {
      descParts.push(`Trees/Crops: ${treesCropsPresent.trim()}`);
    }
    if (accessObservations.trim()) {
      descParts.push(`Access & Boundary: ${accessObservations.trim()}`);
    }
    if (latitude.trim() && longitude.trim()) {
      descParts.push(`Coordinates: Lat ${latitude.trim()}°, Long ${longitude.trim()}°`);
    }
    if (surveySketchRef.trim()) {
      descParts.push(`Survey Sketch Ref: ${surveySketchRef.trim()}`);
    }
    if (physicalNotes.trim()) {
      descParts.push(`Notes: ${physicalNotes.trim()}`);
    }

    const fullDescription = descParts.length > 0 ? descParts.join(' | ') : null;

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        state: stateName.trim(),
        district: district.trim(),
        taluk: taluk.trim(),
        village: village.trim(),
        surveyNumber: surveyNumber.trim(),
        subdivisionNumber: subdivisionNumber.trim() || null,
        landRecordReference: landRecordReference.trim() || null,
        totalArea: parsedTotal,
        areaUnit,
        proposedAffectedArea: parsedProposed,
        affectedAreaUnit,
        landUse: landUse || null,
        physicalDescription: fullDescription,
      };

      if (customParcelId.trim()) {
        payload.parcelId = customParcelId.trim();
      }

      const res = await fetch(`/api/acquisition-cases/${caseId}/parcels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add parcel to acquisition case');
      }

      onSuccess(json.data);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred creating the parcel entry'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      id="parcel-entry-modal"
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
              Add Land Parcel Entry
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#94a3b8' }}>
              Field verification parcel identification and proposed affected area entry
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Toggle */}
        <div
          style={{
            display: 'flex',
            background: '#0f172a',
            padding: '0.375rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => { setEntryMode('NEW'); setErrorMessage(null); }}
            style={{
              background: entryMode === 'NEW' ? '#1e293b' : 'transparent',
              border: entryMode === 'NEW' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              color: entryMode === 'NEW' ? '#60a5fa' : '#94a3b8',
              borderRadius: '6px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            id="tab-new-parcel-mode"
          >
            ✦ Create New Parcel Entry
          </button>
          <button
            type="button"
            onClick={() => { setEntryMode('EXISTING'); setErrorMessage(null); }}
            style={{
              background: entryMode === 'EXISTING' ? '#1e293b' : 'transparent',
              border: entryMode === 'EXISTING' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              color: entryMode === 'EXISTING' ? '#60a5fa' : '#94a3b8',
              borderRadius: '6px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            id="tab-existing-parcel-mode"
          >
            🔗 Link Existing Registered Parcel
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMessage && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                fontSize: '0.8125rem',
                color: '#f87171',
              }}
              role="alert"
              id="parcel-entry-error"
            >
              <span>{errorMessage}</span>
            </div>
          )}

          {entryMode === 'EXISTING' ? (
            /* Mode B: Link existing parcel */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label
                  htmlFor="link-parcel-id"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                >
                  NLAMS Parcel ID or UUID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="link-parcel-id"
                  type="text"
                  placeholder="e.g. NLAMS-PRC-000001 or parcel UUID"
                  value={existingParcelId}
                  onChange={(e) => setExistingParcelId(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="users-search-input"
                  style={{ width: '100%', height: '40px' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                  Enter the canonical parcel identifier from the national parcel registry.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    htmlFor="link-proposed-area"
                    style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                  >
                    Proposed Affected Area for this Case <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="link-proposed-area"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="e.g. 1500"
                    value={proposedAffectedArea}
                    onChange={(e) => setProposedAffectedArea(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="users-search-input"
                    style={{ width: '100%', height: '40px' }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="link-affected-unit"
                    style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                  >
                    Unit <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    id="link-affected-unit"
                    value={affectedAreaUnit}
                    onChange={(e) => setAffectedAreaUnit(e.target.value)}
                    disabled={isSubmitting}
                    className="users-search-input"
                    style={{ width: '100%', height: '40px', background: '#1e293b', color: '#f1f5f9' }}
                  >
                    {AREA_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Mode A: New Canonical Parcel */
            <>
              {/* Section A: Land identification */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    A. Land Identification
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Cadastral locality</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-state" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      State <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="parcel-state"
                      type="text"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-district" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      District <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="parcel-district"
                      type="text"
                      placeholder="e.g. Bengaluru Urban"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-taluk" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Taluk / Tehsil <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="parcel-taluk"
                      type="text"
                      placeholder="e.g. Bengaluru North"
                      value={taluk}
                      onChange={(e) => setTaluk(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-village" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Village / Locality <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="parcel-village"
                      type="text"
                      placeholder="e.g. Yelahanka"
                      value={village}
                      onChange={(e) => setVillage(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-survey" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Survey Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="parcel-survey"
                      type="text"
                      placeholder="e.g. 104"
                      value={surveyNumber}
                      onChange={(e) => setSurveyNumber(e.target.value)}
                      required
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-subdivision" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Subdivision / Hissa Number (optional)
                    </label>
                    <input
                      id="parcel-subdivision"
                      type="text"
                      placeholder="e.g. 1A, 2/P"
                      value={subdivisionNumber}
                      onChange={(e) => setSubdivisionNumber(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-land-record-ref" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Land Record Reference / RTC # (optional)
                    </label>
                    <input
                      id="parcel-land-record-ref"
                      type="text"
                      placeholder="e.g. RTC-2026-KA-9912"
                      value={landRecordReference}
                      onChange={(e) => setLandRecordReference(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-custom-id" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Parcel ID (Auto-generated if blank)
                    </label>
                    <input
                      id="parcel-custom-id"
                      type="text"
                      placeholder="Auto: NLAMS-PRC-XXXXXX"
                      value={customParcelId}
                      onChange={(e) => setCustomParcelId(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>

              {/* Section B: Area details */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                }}
              >
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#34d399', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  B. Area Details
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  {/* Total Recorded Area */}
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.06)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#93c5fd', display: 'block', marginBottom: '0.75rem' }}>
                      Total Recorded Parcel Area <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                      <input
                        id="parcel-total-area"
                        type="number"
                        step="any"
                        min="0.0001"
                        placeholder="e.g. 5000"
                        value={totalArea}
                        onChange={(e) => setTotalArea(e.target.value)}
                        required
                        disabled={isSubmitting}
                        className="users-search-input"
                        style={{ width: '100%', height: '36px' }}
                      />
                      <select
                        id="parcel-area-unit"
                        value={areaUnit}
                        onChange={(e) => setAreaUnit(e.target.value)}
                        disabled={isSubmitting}
                        className="users-search-input"
                        style={{ width: '100%', height: '36px', background: '#1e293b', color: '#f1f5f9' }}
                      >
                        {AREA_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.value}</option>
                        ))}
                      </select>
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                      Official total area recorded in Revenue / Cadastral records
                    </span>
                  </div>

                  {/* Proposed Affected Area */}
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.06)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6ee7b7', display: 'block', marginBottom: '0.75rem' }}>
                      Proposed Affected Area <span style={{ color: '#ef4444' }}>*</span>
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                      <input
                        id="parcel-proposed-area"
                        type="number"
                        step="any"
                        min="0.0001"
                        placeholder="e.g. 1200"
                        value={proposedAffectedArea}
                        onChange={(e) => setProposedAffectedArea(e.target.value)}
                        required
                        disabled={isSubmitting}
                        className="users-search-input"
                        style={{ width: '100%', height: '36px' }}
                      />
                      <select
                        id="parcel-affected-unit"
                        value={affectedAreaUnit}
                        onChange={(e) => setAffectedAreaUnit(e.target.value)}
                        disabled={isSubmitting}
                        className="users-search-input"
                        style={{ width: '100%', height: '36px', background: '#1e293b', color: '#f1f5f9' }}
                      >
                        {AREA_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.value}</option>
                        ))}
                      </select>
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                      Area proposed for acquisition in this project case
                    </span>
                  </div>
                </div>

                {isAreaExceeded && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '6px',
                      padding: '0.625rem 0.875rem',
                      marginTop: '0.875rem',
                      fontSize: '0.8125rem',
                      color: '#fbbf24',
                    }}
                    id="area-exceeded-warning"
                  >
                    ⚠️ <strong>Area Validation:</strong> Proposed affected area ({proposedAffectedArea} {affectedAreaUnit}) exceeds total recorded parcel area ({totalArea} {areaUnit}). Proposed area must be less than or equal to total area.
                  </div>
                )}
              </div>

              {/* Section C: Physical land details */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                }}
              >
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fbbf24', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  C. Physical Land Details
                </h4>

                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="parcel-land-use" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Current Land Use
                  </label>
                  <select
                    id="parcel-land-use"
                    value={landUse}
                    onChange={(e) => setLandUse(e.target.value)}
                    disabled={isSubmitting}
                    className="users-search-input"
                    style={{ width: '100%', height: '36px', background: '#1e293b', color: '#f1f5f9' }}
                  >
                    {LAND_USE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-structures" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Structures Present (if any)
                    </label>
                    <input
                      id="parcel-structures"
                      type="text"
                      placeholder="e.g. Pump house, shed, perimeter fence"
                      value={structuresPresent}
                      onChange={(e) => setStructuresPresent(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-trees" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Trees / Crops Present
                    </label>
                    <input
                      id="parcel-trees"
                      type="text"
                      placeholder="e.g. 15 coconut palms, paddy crop"
                      value={treesCropsPresent}
                      onChange={(e) => setTreesCropsPresent(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="parcel-access" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Access & Boundary Observations
                  </label>
                  <input
                    id="parcel-access"
                    type="text"
                    placeholder="e.g. Village road frontage along West boundary; clear stone markers"
                    value={accessObservations}
                    onChange={(e) => setAccessObservations(e.target.value)}
                    disabled={isSubmitting}
                    className="users-search-input"
                    style={{ width: '100%', height: '36px' }}
                  />
                </div>

                <div>
                  <label htmlFor="parcel-notes" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Additional Ground Inspection Notes
                  </label>
                  <textarea
                    id="parcel-notes"
                    placeholder="General observations, terrain, encumbrances, or notable physical landmarks"
                    value={physicalNotes}
                    onChange={(e) => setPhysicalNotes(e.target.value)}
                    disabled={isSubmitting}
                    className="users-search-input"
                    style={{ width: '100%', minHeight: '60px', padding: '0.5rem' }}
                  />
                </div>
              </div>

              {/* Section D: Location and spatial references */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                }}
              >
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c084fc', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  D. Location & Spatial References (Optional)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div>
                    <label htmlFor="parcel-lat" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Latitude (°N)
                    </label>
                    <input
                      id="parcel-lat"
                      type="number"
                      step="any"
                      placeholder="e.g. 13.0827"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-lng" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Longitude (°E)
                    </label>
                    <input
                      id="parcel-lng"
                      type="number"
                      step="any"
                      placeholder="e.g. 77.5877"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="parcel-sketch-ref" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                      Cadastral / Survey Sketch #
                    </label>
                    <input
                      id="parcel-sketch-ref"
                      type="text"
                      placeholder="e.g. SK-KA-2026-44"
                      value={surveySketchRef}
                      onChange={(e) => setSurveySketchRef(e.target.value)}
                      disabled={isSubmitting}
                      className="users-search-input"
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div
            style={{
              paddingTop: '0.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (entryMode === 'NEW' && isAreaExceeded)}
              className="btn-primary"
              id="submit-parcel-btn"
            >
              {isSubmitting ? 'Saving Parcel...' : entryMode === 'NEW' ? '✓ Save Land Parcel' : '🔗 Link Parcel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
