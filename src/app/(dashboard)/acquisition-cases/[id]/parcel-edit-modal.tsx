'use client';

import React, { useState } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import { convertAreaToSqm } from '../../../../lib/geo-utils';

interface ParcelEditModalProps {
  caseId: string;
  item: CaseParcelWithDetails;
  onClose: () => void;
  onSuccess: (updated: CaseParcelWithDetails) => void;
}

const AREA_UNITS = [
  { value: 'SQ_M', label: 'Square Meters (sq m)' },
  { value: 'HECTARE', label: 'Hectares (ha)' },
  { value: 'ACRE', label: 'Acres (ac)' },
  { value: 'SQ_KM', label: 'Square Kilometers (sq km)' },
];

export function ParcelEditModal({
  caseId,
  item,
  onClose,
  onSuccess,
}: ParcelEditModalProps) {
  const { parcel } = item;

  const [proposedArea, setProposedArea] = useState<string>(item.proposedAffectedArea);
  const [affectedUnit, setAffectedUnit] = useState<string>(item.affectedAreaUnit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Area check
  const totalSqm = convertAreaToSqm(Number(parcel.totalArea), parcel.areaUnit);
  const proposedSqm = convertAreaToSqm(Number(proposedArea), affectedUnit);
  const isAreaExceeded =
    !isNaN(totalSqm) &&
    !isNaN(proposedSqm) &&
    Number(proposedArea) > 0 &&
    proposedSqm > totalSqm + 1e-4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsedArea = parseFloat(proposedArea);
    if (isNaN(parsedArea) || parsedArea <= 0) {
      setErrorMessage('Proposed affected area must be a positive number');
      return;
    }

    if (isAreaExceeded) {
      setErrorMessage(
        `Proposed affected area (${proposedArea} ${affectedUnit}) cannot exceed the recorded total parcel area (${parcel.totalArea} ${parcel.areaUnit})`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/parcels/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposedAffectedArea: parsedArea,
          affectedAreaUnit: affectedUnit,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update parcel association');
      }

      onSuccess(json.data);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while updating the parcel'
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
      id="parcel-edit-modal"
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
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
              Edit Case Parcel
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#94a3b8' }}>
              Update proposed affected area for <strong style={{ color: '#cbd5e1' }}>{parcel.parcelId}</strong>
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

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {errorMessage && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.8125rem',
                color: '#f87171',
              }}
              role="alert"
              id="parcel-edit-error"
            >
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Read-Only Canonical Identity Summary */}
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Locality</span>
              <span style={{ color: '#cbd5e1' }}>{parcel.village}, {parcel.taluk}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Survey / Subdivision</span>
              <span style={{ color: '#cbd5e1' }}>#{parcel.surveyNumber} {parcel.subdivisionNumber ? `(${parcel.subdivisionNumber})` : ''}</span>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Recorded Total Area (Canonical — Immutable)</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                {Number(parcel.totalArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {parcel.areaUnit}
              </span>
            </div>
          </div>

          {/* Editable Proposed Affected Area */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="edit-proposed-area"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
            >
              Proposed Affected Area <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="edit-proposed-area"
              type="number"
              step="any"
              min="0.0001"
              value={proposedArea}
              onChange={(e) => setProposedArea(e.target.value)}
              required
              disabled={isSubmitting}
              className="users-search-input"
              style={{ width: '100%', height: '40px' }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="edit-affected-unit"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
            >
              Affected Area Unit <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="edit-affected-unit"
              value={affectedUnit}
              onChange={(e) => setAffectedUnit(e.target.value)}
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

          {isAreaExceeded && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.8125rem',
                color: '#fbbf24',
              }}
              id="edit-area-warning"
            >
              ⚠️ <strong>Area Warning:</strong> Proposed affected area ({proposedArea} {affectedUnit}) exceeds recorded total parcel area ({parcel.totalArea} {parcel.areaUnit}). Please adjust before saving.
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
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
              disabled={isSubmitting || isAreaExceeded}
              className="btn-primary"
              id="save-parcel-edit-btn"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
