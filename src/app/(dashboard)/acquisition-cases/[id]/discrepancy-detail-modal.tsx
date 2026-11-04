'use client';

import React, { useState } from 'react';
import type { DiscrepancyWithDetails } from '../../../../repositories/discrepancy.repository';

interface DiscrepancyDetailModalProps {
  discrepancy: DiscrepancyWithDetails;
  caseId: string;
  currentUserId: string;
  userRoles: string[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onDiscrepancyUpdated: (updated: DiscrepancyWithDetails) => void;
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

export function DiscrepancyDetailModal({
  discrepancy,
  caseId,
  currentUserId,
  userRoles,
  isSuperAdmin,
  onClose,
  onDiscrepancyUpdated,
}: DiscrepancyDetailModalProps) {
  const isLandOfficer = isSuperAdmin || userRoles.includes('LAND_OFFICER');
  const isFieldOfficer = isSuperAdmin || userRoles.includes('FIELD_OFFICER');
  const isProjectOfficer = isSuperAdmin || userRoles.includes('PROJECT_OFFICER');

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'INVESTIGATIONS' | 'RESOLUTION'>('OVERVIEW');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Start Investigation form state
  const [isStartingInvestigation, setIsStartingInvestigation] = useState(false);
  const [startNotes, setStartNotes] = useState('');
  const [isSubmittingStart, setIsSubmittingStart] = useState(false);

  // Active Draft Investigation edit state
  const activeDraft = discrepancy.investigations.find((i) => i.status === 'DRAFT');
  const [draftFindings, setDraftFindings] = useState(activeDraft?.findings || '');
  const [draftNotes, setDraftNotes] = useState(activeDraft?.notes || '');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmittingFindings, setIsSubmittingFindings] = useState(false);

  // Evidence attachment state
  const [isAddingEvidence, setIsAddingEvidence] = useState(false);
  const [evidenceType, setEvidenceType] = useState('PHOTO');
  const [fileReference, setFileReference] = useState('');
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [isSavingEvidence, setIsSavingEvidence] = useState(false);

  // Resolution form state
  const [resolutionDecision, setResolutionDecision] = useState<
    'RESOLVED' | 'RETURNED_FOR_FURTHER_INVESTIGATION'
  >('RESOLVED');
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [isConfirmingResolution, setIsConfirmingResolution] = useState(false);
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  const latestInvestigation = discrepancy.investigations[0] || null;
  const isInvestigator =
    activeDraft &&
    (activeDraft.investigatorId === currentUserId || activeDraft.createdBy === currentUserId || isSuperAdmin);

  // Separation of duties for resolution: Decision maker cannot be the investigator
  const isSubmittedInvestigator =
    latestInvestigation &&
    latestInvestigation.status === 'SUBMITTED' &&
    (latestInvestigation.investigatorId === currentUserId || latestInvestigation.createdBy === currentUserId);

  const canResolve =
    (isLandOfficer || isProjectOfficer || isSuperAdmin) &&
    discrepancy.status === 'SUBMITTED_FOR_RESOLUTION' &&
    !isSubmittedInvestigator;

  const statusBadge = STATUS_BADGES[discrepancy.status] || STATUS_BADGES.OPEN;

  // Handle Start Investigation
  const handleStartInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmittingStart(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}/investigations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: startNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to start investigation');

      setSuccessMessage('Investigation initiated successfully');
      setIsStartingInvestigation(false);
      onDiscrepancyUpdated(json.data.discrepancy);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error starting investigation');
    } finally {
      setIsSubmittingStart(false);
    }
  };

  // Handle Save Draft Findings
  const handleSaveDraft = async () => {
    if (!activeDraft) return;
    setErrorMessage(null);
    setIsSavingDraft(true);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}/investigations/${activeDraft.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            findings: draftFindings.trim() || null,
            notes: draftNotes.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save draft');

      setSuccessMessage('Investigation draft saved');
      const updatedInv = json.data;
      const updated = {
        ...discrepancy,
        investigations: discrepancy.investigations.map((i) =>
          i.id === updatedInv.id ? updatedInv : i
        ),
      };
      onDiscrepancyUpdated(updated);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error saving draft');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle Attach Evidence
  const handleAttachEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDraft) return;
    setErrorMessage(null);
    if (!fileReference.trim()) {
      setErrorMessage('File reference is required');
      return;
    }

    setIsSavingEvidence(true);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}/investigations/${activeDraft.id}/evidence`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evidenceType,
            fileReference: fileReference.trim(),
            caption: caption.trim() || null,
            description: description.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to attach evidence');

      setSuccessMessage('Evidence attached successfully');
      setFileReference('');
      setCaption('');
      setDescription('');
      setIsAddingEvidence(false);

      // Refresh discrepancy
      const refreshRes = await fetch(`/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}`);
      const refreshJson = await refreshRes.json();
      if (refreshJson.success) onDiscrepancyUpdated(refreshJson.data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error attaching evidence');
    } finally {
      setIsSavingEvidence(false);
    }
  };

  // Handle Submit Investigation Findings
  const handleSubmitFindings = async () => {
    if (!activeDraft) return;
    setErrorMessage(null);
    if (draftFindings.trim().length < 5) {
      setErrorMessage('Investigation findings must be at least 5 characters long');
      return;
    }

    setIsSubmittingFindings(true);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}/investigations/${activeDraft.id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            findings: draftFindings.trim(),
            notes: draftNotes.trim() || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to submit findings');

      setSuccessMessage('Investigation findings submitted for resolution');
      onDiscrepancyUpdated(json.data.discrepancy);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error submitting findings');
    } finally {
      setIsSubmittingFindings(false);
    }
  };

  // Handle Record Resolution Decision
  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (resolutionRemarks.trim().length < 5) {
      setErrorMessage('Remarks explaining the resolution decision are mandatory (min 5 characters)');
      return;
    }
    if (!isConfirmingResolution) {
      setErrorMessage('Please confirm your resolution decision');
      return;
    }

    setIsSubmittingResolution(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/discrepancies/${discrepancy.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: resolutionDecision,
          remarks: resolutionRemarks.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record resolution');

      setSuccessMessage(`Discrepancy ${resolutionDecision === 'RESOLVED' ? 'resolved' : 'returned for further investigation'}`);
      onDiscrepancyUpdated(json.data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error recording resolution decision');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  return (
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
          maxWidth: '52rem',
          maxHeight: '90vh',
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
            alignItems: 'flex-start',
            backgroundColor: '#1e293b',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Discrepancy #{discrepancy.id.slice(0, 8)}
              </h2>
              <span
                style={{
                  backgroundColor: statusBadge.bg,
                  color: statusBadge.color,
                  border: `1px solid ${statusBadge.border}`,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {statusBadge.label}
              </span>
              <span
                style={{
                  backgroundColor: '#334155',
                  color: '#94a3b8',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}
              >
                {discrepancy.category}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
              Parcel: {discrepancy.parcel.parcelId} (Survey #{discrepancy.parcel.surveyNumber}) &bull; {discrepancy.parcel.village}, {discrepancy.parcel.taluk}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              padding: '0.25rem',
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            borderBottom: '1px solid #1e293b',
            padding: '0 1.5rem',
            backgroundColor: '#0f172a',
          }}
        >
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            style={{
              padding: '0.75rem 0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'OVERVIEW' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'OVERVIEW' ? '#60a5fa' : '#94a3b8',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Overview & Trigger
          </button>
          <button
            onClick={() => setActiveTab('INVESTIGATIONS')}
            style={{
              padding: '0.75rem 0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'INVESTIGATIONS' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'INVESTIGATIONS' ? '#60a5fa' : '#94a3b8',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Investigation ({discrepancy.investigations.length})
          </button>
          <button
            onClick={() => setActiveTab('RESOLUTION')}
            style={{
              padding: '0.75rem 0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'RESOLUTION' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'RESOLUTION' ? '#60a5fa' : '#94a3b8',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Resolution & History ({discrepancy.resolutionHistory.length})
          </button>
        </div>

        {/* Body content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {errorMessage && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#f87171',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                color: '#34d399',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              {successMessage}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Discrepancy Reason */}
              <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>
                  Land Officer Flagging Reason
                </h3>
                <p style={{ margin: 0, color: '#f8fafc', fontSize: '0.925rem', whiteSpace: 'pre-wrap' }}>
                  {discrepancy.description}
                </p>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Flagged by {discrepancy.creator.name} ({discrepancy.creator.email}) on {new Date(discrepancy.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Triggering Field Report */}
              <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 0.75rem 0' }}>
                  Triggering Field Report Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Report Revision:</span>{' '}
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>Revision #{discrepancy.report.revisionNumber}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Report Outcome:</span>{' '}
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>{discrepancy.report.outcome || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Submitted At:</span>{' '}
                    <span style={{ color: '#cbd5e1' }}>
                      {discrepancy.report.submittedAt ? new Date(discrepancy.report.submittedAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Review Status:</span>{' '}
                    <span style={{ color: '#f87171' }}>{discrepancy.report.status}</span>
                  </div>
                </div>
                {discrepancy.report.observations && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #334155' }}>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Field Observations:</span>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#e2e8f0', fontSize: '0.875rem' }}>
                      {discrepancy.report.observations}
                    </p>
                  </div>
                )}
              </div>

              {/* Parcel Reference Info */}
              <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 0.75rem 0' }}>
                  Parcel Reference Extents
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Total Official Area:</span>{' '}
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>{discrepancy.parcel.totalArea} {discrepancy.parcel.areaUnit}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Locality:</span>{' '}
                    <div style={{ color: '#cbd5e1' }}>{discrepancy.parcel.village}, {discrepancy.parcel.district}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>State:</span>{' '}
                    <div style={{ color: '#cbd5e1' }}>{discrepancy.parcel.state}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INVESTIGATION */}
          {activeTab === 'INVESTIGATIONS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Trigger button to start investigation if OPEN */}
              {discrepancy.status === 'OPEN' && !isStartingInvestigation && (
                <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px dashed #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', color: '#f8fafc', fontSize: '0.95rem' }}>
                      No active investigation
                    </h4>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                      Start an investigation to record site inspection findings and attach supporting evidence.
                    </p>
                  </div>
                  {(isFieldOfficer || isLandOfficer || isSuperAdmin) && (
                    <button
                      onClick={() => setIsStartingInvestigation(true)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Start Investigation
                    </button>
                  )}
                </div>
              )}

              {/* Start Investigation Form */}
              {isStartingInvestigation && (
                <form
                  onSubmit={handleStartInvestigation}
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '1.25rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #3b82f6',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#60a5fa', fontSize: '1rem' }}>
                    Start New Investigation
                  </h4>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Initial Notes / Scope (optional)
                    </label>
                    <textarea
                      value={startNotes}
                      onChange={(e) => setStartNotes(e.target.value)}
                      rows={3}
                      placeholder="Outline instructions, focus areas, or scheduled site visit..."
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setIsStartingInvestigation(false)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        background: 'none',
                        border: '1px solid #475569',
                        color: '#cbd5e1',
                        borderRadius: '0.375rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingStart}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        opacity: isSubmittingStart ? 0.6 : 1,
                      }}
                    >
                      {isSubmittingStart ? 'Starting...' : 'Confirm & Start'}
                    </button>
                  </div>
                </form>
              )}

              {/* Active Draft Investigation Workspace */}
              {activeDraft && (
                <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', color: '#f8fafc', fontSize: '1rem' }}>
                        Active Investigation Draft
                      </h4>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>
                        Investigator: {activeDraft.investigator.name} &bull; Started {new Date(activeDraft.startedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        color: '#fbbf24',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      DRAFT
                    </span>
                  </div>

                  {/* Findings input */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Investigation Findings <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      value={draftFindings}
                      onChange={(e) => setDraftFindings(e.target.value)}
                      disabled={!isInvestigator}
                      rows={4}
                      placeholder="Detail physical inspection observations, actual boundary coordinates, or land registry cross-check findings..."
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>

                  {/* Investigation Notes */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Additional Investigation Notes
                    </label>
                    <textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      disabled={!isInvestigator}
                      rows={2}
                      placeholder="Notes on methodology, equipment used, or parties interviewed..."
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>

                  {/* Attached Evidence Section */}
                  <div style={{ marginBottom: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                        Attached Evidence ({activeDraft.evidence.length})
                      </span>
                      {isInvestigator && !isAddingEvidence && (
                        <button
                          type="button"
                          onClick={() => setIsAddingEvidence(true)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            backgroundColor: '#334155',
                            color: '#cbd5e1',
                            border: 'none',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          + Add Evidence
                        </button>
                      )}
                    </div>

                    {isAddingEvidence && (
                      <form onSubmit={handleAttachEvidence} style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '0.375rem', marginBottom: '0.75rem', border: '1px solid #334155' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Type</label>
                            <select
                              value={evidenceType}
                              onChange={(e) => setEvidenceType(e.target.value)}
                              style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                            >
                              <option value="PHOTO">Photo</option>
                              <option value="SKETCH">Sketch</option>
                              <option value="GEO_TAGGED_IMAGE">Geo-Tagged Image</option>
                              <option value="SURVEY_RECORD">Survey Record</option>
                              <option value="NOTICE_COPY">Notice Copy</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Storage Reference *</label>
                            <input
                              type="text"
                              value={fileReference}
                              onChange={(e) => setFileReference(e.target.value)}
                              placeholder="e.g. inv_doc_789.pdf"
                              style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                            />
                          </div>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <input
                            type="text"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Caption (e.g. Peg marker location photo)"
                            style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setIsAddingEvidence(false)}
                            style={{ padding: '0.25rem 0.5rem', background: 'none', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingEvidence}
                            style={{ padding: '0.25rem 0.5rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            {isSavingEvidence ? 'Adding...' : 'Attach'}
                          </button>
                        </div>
                      </form>
                    )}

                    {activeDraft.evidence.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>
                        No evidence attached to this investigation yet.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeDraft.evidence.map((ev) => (
                          <div key={ev.id} style={{ backgroundColor: '#0f172a', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ backgroundColor: '#334155', color: '#94a3b8', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.7rem', marginRight: '0.5rem' }}>
                                {ev.evidenceType}
                              </span>
                              <span style={{ color: '#f8fafc', fontSize: '0.85rem' }}>{ev.caption || ev.fileReference}</span>
                            </div>
                            <span style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'monospace' }}>{ev.fileReference}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions for draft */}
                  {isInvestigator && (
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={isSavingDraft}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'none',
                          border: '1px solid #475569',
                          color: '#cbd5e1',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        {isSavingDraft ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitFindings}
                        disabled={isSubmittingFindings}
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
                        {isSubmittingFindings ? 'Submitting...' : 'Submit Findings for Resolution'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Past Submitted Investigations List */}
              {discrepancy.investigations.filter((i) => i.status !== 'DRAFT').length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#cbd5e1', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                    Submitted Investigation Findings
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {discrepancy.investigations
                      .filter((i) => i.status !== 'DRAFT')
                      .map((inv) => (
                        <div key={inv.id} style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem' }}>
                              Investigator: {inv.investigator.name}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                              Submitted {inv.submittedAt ? new Date(inv.submittedAt).toLocaleString() : ''}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 0.5rem 0', color: '#e2e8f0', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                            {inv.findings}
                          </p>
                          {inv.notes && (
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                              Notes: {inv.notes}
                            </div>
                          )}
                          {inv.evidence.length > 0 && (
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #334155' }}>
                              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Evidence ({inv.evidence.length}):</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                {inv.evidence.map((ev) => (
                                  <span key={ev.id} style={{ backgroundColor: '#0f172a', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {ev.evidenceType}: {ev.caption || ev.fileReference}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESOLUTION & HISTORY */}
          {activeTab === 'RESOLUTION' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Resolution Decision Form (when in SUBMITTED_FOR_RESOLUTION) */}
              {discrepancy.status === 'SUBMITTED_FOR_RESOLUTION' && (
                <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #3b82f6' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#60a5fa', fontSize: '1rem' }}>
                    Record Resolution Decision
                  </h4>
                  <p style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Review submitted findings and record an independent administrative resolution decision.
                  </p>

                  {isSubmittedInvestigator ? (
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
                      Separation of duties: As the investigator who submitted the findings, you are not permitted to resolve this discrepancy. Another authorized officer must decide.
                    </div>
                  ) : canResolve ? (
                    <form onSubmit={handleResolve}>
                      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc', fontSize: '0.875rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="resolutionDecision"
                            value="RESOLVED"
                            checked={resolutionDecision === 'RESOLVED'}
                            onChange={() => setResolutionDecision('RESOLVED')}
                          />
                          Resolve Discrepancy
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc', fontSize: '0.875rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="resolutionDecision"
                            value="RETURNED_FOR_FURTHER_INVESTIGATION"
                            checked={resolutionDecision === 'RETURNED_FOR_FURTHER_INVESTIGATION'}
                            onChange={() => setResolutionDecision('RETURNED_FOR_FURTHER_INVESTIGATION')}
                          />
                          Return for Further Investigation
                        </label>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          Resolution Remarks / Reason <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                          value={resolutionRemarks}
                          onChange={(e) => setResolutionRemarks(e.target.value)}
                          rows={3}
                          placeholder="Provide detailed administrative justification for this resolution decision..."
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isConfirmingResolution}
                            onChange={(e) => setIsConfirmingResolution(e.target.checked)}
                          />
                          I confirm this resolution decision based on verified site findings.
                        </label>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={isSubmittingResolution}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: resolutionDecision === 'RESOLVED' ? '#16a34a' : '#d97706',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            opacity: isSubmittingResolution ? 0.6 : 1,
                          }}
                        >
                          {isSubmittingResolution ? 'Recording...' : `Submit Decision: ${resolutionDecision === 'RESOLVED' ? 'RESOLVE' : 'RETURN'}`}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>
                      You do not have permission to resolve discrepancies on this case.
                    </p>
                  )}
                </div>
              )}

              {/* Complete Resolution History */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#cbd5e1', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                  Auditable Resolution History
                </h4>
                {discrepancy.resolutionHistory.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    No resolution decisions have been recorded for this discrepancy yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {discrepancy.resolutionHistory.map((res) => (
                      <div key={res.id} style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span
                            style={{
                              backgroundColor: res.decision === 'RESOLVED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: res.decision === 'RESOLVED' ? '#34d399' : '#fbbf24',
                              border: `1px solid ${res.decision === 'RESOLVED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {res.decision}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {new Date(res.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p style={{ margin: '0.5rem 0 0.25rem 0', color: '#e2e8f0', fontSize: '0.875rem' }}>
                          {res.remarks}
                        </p>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Decided by {res.resolver.name} ({res.resolver.email})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#1e293b',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

