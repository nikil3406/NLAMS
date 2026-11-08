'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  DiscrepancyWithDetails,
  CaseDiscrepancyCounts,
} from '../../../../repositories/discrepancy.repository';
import { DiscrepancyDetailModal } from './discrepancy-detail-modal';

interface DiscrepanciesSectionProps {
  caseId: string;
  currentUserId: string;
  userRoles: string[];
  isSuperAdmin: boolean;
  onCountChange?: (counts: CaseDiscrepancyCounts) => void;
}

const STATUS_BADGES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  OPEN: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Open',
  },
  UNDER_INVESTIGATION: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'Under Investigation',
  },
  SUBMITTED_FOR_RESOLUTION: {
    bg: 'rgba(59, 130, 246, 0.12)',
    color: '#60a5fa',
    border: 'rgba(59, 130, 246, 0.3)',
    label: 'Submitted for Resolution',
  },
  RESOLVED: {
    bg: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: 'rgba(16, 185, 129, 0.3)',
    label: 'Resolved',
  },
};

export function DiscrepanciesSection({
  caseId,
  currentUserId,
  userRoles,
  isSuperAdmin,
  onCountChange,
}: DiscrepanciesSectionProps) {
  const isFieldOfficer = isSuperAdmin || userRoles.includes('FIELD_OFFICER');
  const isLandOfficer = isSuperAdmin || userRoles.includes('LAND_OFFICER');

  const [discrepancies, setDiscrepancies] = useState<DiscrepancyWithDetails[]>([]);
  const [counts, setCounts] = useState<CaseDiscrepancyCounts | null>(null);
  const onCountChangeRef = React.useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DiscrepancyWithDetails | null>(null);

  // Create Discrepancy Modal state (for Field Officer)
  const [isCreatingDiscrepancy, setIsCreatingDiscrepancy] = useState(false);
  const [caseParcels, setCaseParcels] = useState<{ id: string; parcel: { parcelId: string; surveyNumber: string; village: string } }[]>([]);
  const [isLoadingParcels, setIsLoadingParcels] = useState(false);
  const [selectedCaseParcelId, setSelectedCaseParcelId] = useState('');
  const [newCategory, setNewCategory] = useState('SURVEY_IDENTITY_MISMATCH');
  const [newDescription, setNewDescription] = useState('');
  const [newEvidenceType, setNewEvidenceType] = useState('PHOTO');
  const [newFileReference, setNewFileReference] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchCaseParcels = useCallback(async () => {
    setIsLoadingParcels(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/parcels?limit=100`);
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        setCaseParcels(list);
        if (list.length > 0 && !selectedCaseParcelId) {
          setSelectedCaseParcelId(list[0].id);
        }
      }
    } catch {}
    finally {
      setIsLoadingParcels(false);
    }
  }, [caseId, selectedCaseParcelId]);

  const handleOpenCreateModal = () => {
    setIsCreatingDiscrepancy(true);
    setCreateError(null);
    fetchCaseParcels();
  };

  const handleCreateDiscrepancySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!selectedCaseParcelId) {
      setCreateError('Please select a parcel');
      return;
    }
    if (newDescription.trim().length < 5) {
      setCreateError('Discrepancy description must be at least 5 characters long');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const evidence = newFileReference.trim()
        ? [
            {
              evidenceType: newEvidenceType,
              fileReference: newFileReference.trim(),
              caption: newCaption.trim() || null,
            },
          ]
        : undefined;

      const res = await fetch(`/api/acquisition-cases/${caseId}/discrepancies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseParcelId: selectedCaseParcelId,
          category: newCategory,
          description: newDescription.trim(),
          evidence,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit discrepancy');
      }

      setIsCreatingDiscrepancy(false);
      setNewDescription('');
      setNewFileReference('');
      setNewCaption('');
      fetchDiscrepancies();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error submitting discrepancy');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const fetchDiscrepancies = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        category: categoryFilter,
        limit: '100',
      });
      const res = await fetch(`/api/acquisition-cases/${caseId}/discrepancies?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load discrepancies');
      }
      const json = await res.json();
      setDiscrepancies(json.data || []);
      setCounts(json.counts);
      if (onCountChangeRef.current && json.counts) {
        onCountChangeRef.current(json.counts);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading discrepancies');
    } finally {
      setIsLoading(false);
    }
  }, [caseId, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchDiscrepancies();
  }, [fetchDiscrepancies]);

  const handleDiscrepancyUpdated = (updated: DiscrepancyWithDetails) => {
    setSelectedDiscrepancy(updated);
    setDiscrepancies((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d))
    );
    fetchDiscrepancies();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metrics Banner */}
      {counts && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '1rem',
          }}
        >
          <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Discrepancies</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.25rem' }}>{counts.totalDiscrepancies}</div>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase' }}>Open</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>{counts.openDiscrepancies}</div>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#fbbf24', textTransform: 'uppercase' }}>Under Investigation</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>{counts.underInvestigationDiscrepancies}</div>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#60a5fa', textTransform: 'uppercase' }}>Submitted for Resolution</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa', marginTop: '0.25rem' }}>{counts.submittedForResolutionDiscrepancies}</div>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#34d399', textTransform: 'uppercase' }}>Resolved</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399', marginTop: '0.25rem' }}>{counts.resolvedDiscrepancies}</div>
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#1e293b',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Filter Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="UNDER_INVESTIGATION">Under Investigation</option>
              <option value="SUBMITTED_FOR_RESOLUTION">Submitted for Resolution</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Filter Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="SURVEY_IDENTITY_MISMATCH">Survey Identity Mismatch</option>
              <option value="AREA_MISMATCH">Area Mismatch</option>
              <option value="BOUNDARY_MISMATCH">Boundary Mismatch</option>
              <option value="LAND_USE_MISMATCH">Land Use Mismatch</option>
              <option value="LAND_RECORD_MISMATCH">Land Record Mismatch</option>
              <option value="OWNERSHIP_RECORD_CONFLICT">Ownership Record Conflict</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isFieldOfficer && (
            <button
              onClick={handleOpenCreateModal}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              + Report Discrepancy
            </button>
          )}
          <button
            onClick={fetchDiscrepancies}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#334155',
              color: '#cbd5e1',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem' }}>
          {errorMessage}
        </div>
      )}

      {/* Discrepancies Table */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>ID</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>Parcel & Survey</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>Category</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>Triggering Report</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>Investigator</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading discrepancies...
                </td>
              </tr>
            ) : discrepancies.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  No discrepancies found for this acquisition case.
                </td>
              </tr>
            ) : (
              discrepancies.map((d) => {
                const badge = STATUS_BADGES[d.status] || STATUS_BADGES.OPEN;
                const latestInv = d.investigations?.[0] || null;

                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#60a5fa' }}>
                      #{d.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>
                      <div>{d.parcel?.parcelId || 'N/A'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Survey #{d.parcel?.surveyNumber || '-'} &bull; {d.parcel?.village || '-'}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ backgroundColor: '#334155', color: '#cbd5e1', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                        {d.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                      <div>Rev #{d.report?.revisionNumber ?? 1} ({d.report?.outcome || '-'})</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{d.report?.status || '-'}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                      {latestInv ? (
                        <div>
                          <div>{latestInv.investigator?.name || 'Officer'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{latestInv.status}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {(() => {
                        const isOriginalFO = d.createdBy === currentUserId && isFieldOfficer;
                        let actionLabel = 'View Details';
                        let actionBg = '#334155';

                        if (d.status === 'SUBMITTED_FOR_RESOLUTION' && isOriginalFO) {
                          actionLabel = 'Review & Close';
                          actionBg = '#16a34a';
                        } else if (isLandOfficer && d.status === 'OPEN') {
                          actionLabel = 'Investigate';
                          actionBg = '#2563eb';
                        } else if (isLandOfficer && d.status === 'UNDER_INVESTIGATION') {
                          const hasActiveDraft = d.investigations?.some((i) => i.status === 'DRAFT');
                          actionLabel = hasActiveDraft ? 'Continue Investigation' : 'Start Follow-up';
                          actionBg = '#2563eb';
                        }

                        return (
                          <button
                            onClick={() => setSelectedDiscrepancy(d)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              backgroundColor: actionBg,
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            {actionLabel}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Discrepancy Modal (Field Officer) */}
      {isCreatingDiscrepancy && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '38rem',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#1e293b',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
                Report Parcel Discrepancy
              </h3>
              <button
                onClick={() => setIsCreatingDiscrepancy(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateDiscrepancySubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {createError && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
                  {createError}
                </div>
              )}

              {/* Parcel selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Affected Parcel <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {isLoadingParcels ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading parcels...</div>
                ) : (
                  <select
                    value={selectedCaseParcelId}
                    onChange={(e) => setSelectedCaseParcelId(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    {caseParcels.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.parcel?.parcelId || 'Parcel'} — Survey #{cp.parcel?.surveyNumber || '-'} ({cp.parcel?.village || '-'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Discrepancy Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="SURVEY_IDENTITY_MISMATCH">Survey Identity Mismatch</option>
                  <option value="AREA_MISMATCH">Area Mismatch</option>
                  <option value="BOUNDARY_MISMATCH">Boundary Mismatch</option>
                  <option value="LAND_USE_MISMATCH">Land Use Mismatch</option>
                  <option value="LAND_RECORD_MISMATCH">Land Record Mismatch</option>
                  <option value="OWNERSHIP_RECORD_CONFLICT">Ownership Record Conflict</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Discrepancy Observation & Description <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  placeholder="Detail the ground discrepancy observed during physical inspection..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Optional Evidence Attachment */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                  Supporting Evidence (Optional)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select
                    value={newEvidenceType}
                    onChange={(e) => setNewEvidenceType(e.target.value)}
                    style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                  >
                    <option value="PHOTO">Photo</option>
                    <option value="SKETCH">Sketch</option>
                    <option value="GEO_TAGGED_IMAGE">Geo-Tagged Image</option>
                    <option value="SURVEY_RECORD">Survey Record</option>
                    <option value="NOTICE_COPY">Notice Copy</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    type="text"
                    value={newFileReference}
                    onChange={(e) => setNewFileReference(e.target.value)}
                    placeholder="File reference (e.g. photo_boundary_peg.jpg)"
                    style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                  />
                </div>
                <input
                  type="text"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Caption / description"
                  style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                />
              </div>

              {/* Footer actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCreatingDiscrepancy(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: 'transparent',
                    border: '1px solid #475569',
                    color: '#cbd5e1',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: isSubmittingCreate ? 0.6 : 1,
                  }}
                >
                  {isSubmittingCreate ? 'Submitting...' : 'Submit Discrepancy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discrepancy Detail Modal */}
      {selectedDiscrepancy && (
        <DiscrepancyDetailModal
          discrepancy={selectedDiscrepancy}
          caseId={caseId}
          currentUserId={currentUserId}
          userRoles={userRoles}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedDiscrepancy(null)}
          onDiscrepancyUpdated={handleDiscrepancyUpdated}
        />
      )}
    </div>
  );
}

