'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import { ParcelEntryModal } from './parcel-entry-modal';
import { ParcelEditModal } from './parcel-edit-modal';
import { ParcelDetailModal } from './parcel-detail-modal';

interface ParcelsSectionProps {
  caseId: string;
  caseStatus: string;
  currentUserId?: string;
  userRoles: string[];
  isSuperAdmin: boolean;
  projectLocality?: {
    state?: string;
    district?: string;
  };
  onCountChange?: (count: number) => void;
}

export function ParcelsSection({
  caseId,
  caseStatus,
  currentUserId,
  userRoles,
  isSuperAdmin,
  projectLocality,
  onCountChange,
}: ParcelsSectionProps) {
  // Authorization guards:
  // Strictly only FIELD_OFFICER may add or edit parcels, and only during AWAITING_FIELD_VERIFICATION.
  // SUPER_ADMIN does NOT bypass this separation-of-duties rule.
  const isFieldOfficer = userRoles.includes('FIELD_OFFICER');
  const isAwaitingVerification = caseStatus === 'AWAITING_FIELD_VERIFICATION';
  const canAddOrEdit = isFieldOfficer && isAwaitingVerification;

  const [parcels, setParcels] = useState<CaseParcelWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<CaseParcelWithDetails | null>(null);
  const [viewingParcel, setViewingParcel] = useState<CaseParcelWithDetails | null>(null);

  const fetchParcels = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/parcels?limit=100`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load parcels for this acquisition case');
      }
      const json = await res.json();
      const list: CaseParcelWithDetails[] = json.data || [];
      setParcels(list);
      if (onCountChange) {
        onCountChange(list.length);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred loading parcels'
      );
    } finally {
      setIsLoading(false);
    }
  }, [caseId, onCountChange]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  const handleParcelCreated = (newParcel: CaseParcelWithDetails) => {
    setIsEntryModalOpen(false);
    setSuccessMessage(`Parcel ${newParcel.parcel.parcelId} added successfully.`);
    fetchParcels();
  };

  const handleParcelUpdated = (updated: CaseParcelWithDetails) => {
    setEditingParcel(null);
    if (viewingParcel && viewingParcel.id === updated.id) {
      setViewingParcel(updated);
    }
    setSuccessMessage(`Parcel ${updated.parcel.parcelId} updated successfully.`);
    fetchParcels();
  };

  const filteredParcels = parcels.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const { parcel } = p;
    return (
      parcel.parcelId.toLowerCase().includes(term) ||
      parcel.surveyNumber.toLowerCase().includes(term) ||
      (parcel.subdivisionNumber && parcel.subdivisionNumber.toLowerCase().includes(term)) ||
      parcel.village.toLowerCase().includes(term) ||
      parcel.taluk.toLowerCase().includes(term) ||
      parcel.district.toLowerCase().includes(term) ||
      (parcel.landRecordReference && parcel.landRecordReference.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} id="parcels-section-container">
      {/* Success Notification */}
      {successMessage && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            fontSize: '0.8125rem',
            color: '#6ee7b7',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          role="status"
          id="parcel-success-banner"
        >
          <span>✓ {successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            fontSize: '0.8125rem',
            color: '#f87171',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          role="alert"
          id="parcel-section-error-banner"
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={fetchParcels}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Header & Actions Bar */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                Associated Land Parcels
              </h2>
              <span
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
                id="parcels-count-badge"
              >
                {parcels.length} {parcels.length === 1 ? 'Parcel' : 'Parcels'}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#94a3b8' }}>
              Parcels identified and demarcated for this land acquisition case
            </p>
          </div>

          <div>
            {canAddOrEdit ? (
              <button
                type="button"
                onClick={() => setIsEntryModalOpen(true)}
                className="btn-primary"
                id="add-parcel-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
              >
                <span>+</span> Add Land Parcel
              </button>
            ) : (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
                id="parcel-add-disabled-notice"
              >
                {!isAwaitingVerification
                  ? '🔒 Parcel addition available during Field Verification'
                  : '🔒 Restricted to Field Officers'}
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {parcels.length > 0 && (
          <div style={{ maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="Search by Survey #, Village, Parcel ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="users-search-input"
              style={{ width: '100%', height: '36px', fontSize: '0.8125rem' }}
              id="parcel-search-input"
            />
          </div>
        )}
      </div>

      {/* Body: Loading, Empty, or Parcel List */}
      {isLoading ? (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '0.875rem',
          }}
          id="parcels-loading-card"
        >
          <span className="spinner-sm" style={{ marginRight: '0.5rem' }} />
          Loading associated parcels...
        </div>
      ) : filteredParcels.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '3rem 2rem',
            textAlign: 'center',
          }}
          id="parcels-empty-card"
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              margin: '0 auto 1rem auto',
            }}
          >
            🗺️
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 0.5rem 0' }}>
            {parcels.length === 0 ? 'No Parcels Associated Yet' : 'No Parcels Match Your Search'}
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', maxWidth: '460px', margin: '0 auto 1.25rem auto' }}>
            {parcels.length === 0
              ? canAddOrEdit
                ? 'Ground field verification is authorized. As a Field Officer, you can now identify, survey, and record individual physical land parcels affected by this project.'
                : 'Parcels will be demarcated and recorded by assigned Field Officers once ground field verification is authorized.'
              : 'Try adjusting your search criteria or clear the search input.'}
          </p>

          {parcels.length === 0 && canAddOrEdit && (
            <button
              type="button"
              onClick={() => setIsEntryModalOpen(true)}
              className="btn-primary"
              id="empty-state-add-parcel-btn"
            >
              + Add First Land Parcel
            </button>
          )}
        </div>
      ) : (
        /* Parcels Table / Grid */
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Parcel ID</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Locality</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Survey # / Subdivision</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Recorded Total Area</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Proposed Affected Area</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParcels.map((item, idx) => {
                  const { parcel } = item;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx !== filteredParcels.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                      }}
                      id={`parcel-row-${parcel.parcelId}`}
                    >
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            color: '#60a5fa',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={() => setViewingParcel(item)}
                          title="Click to view details"
                        >
                          {parcel.parcelId}
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.village}</div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                          {parcel.taluk}, {parcel.district}
                        </div>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 600 }}>
                          #{parcel.surveyNumber}
                          {parcel.subdivisionNumber && (
                            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '0.25rem' }}>
                              ({parcel.subdivisionNumber})
                            </span>
                          )}
                        </div>
                        {parcel.landRecordReference && (
                          <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            Ref: {parcel.landRecordReference}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 500 }}>
                          {Number(parcel.totalArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                          {parcel.areaUnit}
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span style={{ color: '#34d399', fontWeight: 600 }}>
                          {Number(item.proposedAffectedArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                        </span>
                        <span style={{ color: '#6ee7b7', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                          {item.affectedAreaUnit}
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            background: 'rgba(148, 163, 184, 0.12)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.6875rem',
                            fontWeight: 500,
                          }}
                        >
                          Demarcated
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setViewingParcel(item)}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            id={`view-parcel-${parcel.parcelId}-btn`}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewingParcel(item)}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
                            id={`reports-parcel-${parcel.parcelId}-btn`}
                          >
                            📋 Reports
                          </button>
                          {canAddOrEdit && (
                            <button
                              type="button"
                              onClick={() => setEditingParcel(item)}
                              className="btn-secondary"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: 'rgba(59, 130, 246, 0.4)', color: '#60a5fa' }}
                              id={`edit-parcel-${parcel.parcelId}-btn`}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Parcel Modal */}
      {isEntryModalOpen && (
        <ParcelEntryModal
          caseId={caseId}
          defaultState={projectLocality?.state ?? 'Karnataka'}
          defaultDistrict={projectLocality?.district ?? ''}
          onClose={() => setIsEntryModalOpen(false)}
          onSuccess={handleParcelCreated}
        />
      )}

      {/* Edit Parcel Modal */}
      {editingParcel && (
        <ParcelEditModal
          caseId={caseId}
          item={editingParcel}
          onClose={() => setEditingParcel(null)}
          onSuccess={handleParcelUpdated}
        />
      )}

      {/* Detail View Modal */}
      {viewingParcel && (
        <ParcelDetailModal
          item={viewingParcel}
          caseId={caseId}
          caseStatus={caseStatus}
          currentUserId={currentUserId}
          userRoles={userRoles}
          canEdit={canAddOrEdit}
          onClose={() => setViewingParcel(null)}
          onOpenEdit={() => {
            const current = viewingParcel;
            setViewingParcel(null);
            setEditingParcel(current);
          }}
        />
      )}
    </div>
  );
}
