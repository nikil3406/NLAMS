'use client';

import React, { useState } from 'react';
import type { FieldVerificationReportWithDetails } from '../../../../repositories/field-verification-report.repository';

interface FieldVerificationReviewModalProps {
  report: FieldVerificationReportWithDetails;
  caseId: string;
  caseParcelId: string;
  currentUserId: string;
  userRoles: string[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onDecisionSuccess: (updatedReport: FieldVerificationReportWithDetails) => void;
  onCorrectionInitiated?: (newDraft: FieldVerificationReportWithDetails) => void;
}

export function FieldVerificationReviewModal({
  report,
  caseId,
  caseParcelId,
  currentUserId,
  userRoles,
  isSuperAdmin,
  onClose,
  onDecisionSuccess,
  onCorrectionInitiated,
}: FieldVerificationReviewModalProps) {
  const isLandOfficer = userRoles.includes('LAND_OFFICER');
  const isFieldOfficer = userRoles.includes('FIELD_OFFICER');

  // Separation of duties: Reviewer cannot be the author or submitter
  // SUPER_ADMIN cannot bypass this rule
  const isAuthor =
    report.createdBy === currentUserId ||
    (report.verifiedBy !== null && report.verifiedBy === currentUserId);
  const canReview = isLandOfficer && !isAuthor && report.status === 'SUBMITTED';

  // State for Review Decision Form
  const [decision, setDecision] = useState<
    'ACCEPTED' | 'RETURNED_FOR_CORRECTION' | 'DISCREPANCY_FLAGGED'
  >('ACCEPTED');
  const [remarks, setRemarks] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State for initiating correction
  const [isInitiatingCorrection, setIsInitiatingCorrection] = useState(false);

  // Submit Review Decision
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedRemarks = remarks.trim();
    if (decision === 'RETURNED_FOR_CORRECTION' && trimmedRemarks.length < 5) {
      setErrorMessage(
        'Remarks are required when returning a report for correction (minimum 5 characters).'
      );
      return;
    }
    if (decision === 'DISCREPANCY_FLAGGED' && trimmedRemarks.length < 5) {
      setErrorMessage(
        'A reason or remarks explaining the discrepancy are mandatory when flagging a report (minimum 5 characters).'
      );
      return;
    }
    if (!isConfirmed) {
      setErrorMessage('Please confirm your review decision before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/parcels/${caseParcelId}/reports/${report.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            remarks: trimmedRemarks || null,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit review decision');
      }

      onDecisionSuccess(json.data);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while submitting review'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initiate Correction Draft (for author when returned for correction)
  const handleInitiateCorrection = async () => {
    setIsInitiatingCorrection(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/parcels/${caseParcelId}/reports/${report.id}/correct`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to initiate correction draft');
      }

      if (onCorrectionInitiated) {
        onCorrectionInitiated(json.data);
      } else {
        onDecisionSuccess(json.data);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred initiating correction'
      );
    } finally {
      setIsInitiatingCorrection(false);
    }
  };

  const statusBadges: Record<string, { bg: string; color: string; border: string; label: string }> = {
    DRAFT: {
      bg: 'rgba(148, 163, 184, 0.12)',
      color: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.3)',
      label: 'Draft',
    },
    SUBMITTED: {
      bg: 'rgba(59, 130, 246, 0.12)',
      color: '#60a5fa',
      border: 'rgba(59, 130, 246, 0.3)',
      label: 'Awaiting Review (Submitted)',
    },
    ACCEPTED: {
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#34d399',
      border: 'rgba(16, 185, 129, 0.3)',
      label: 'Accepted',
    },
    RETURNED_FOR_CORRECTION: {
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.3)',
      label: 'Returned for Correction',
    },
    DISCREPANCY_FLAGGED: {
      bg: 'rgba(239, 68, 68, 0.12)',
      color: '#f87171',
      border: 'rgba(239, 68, 68, 0.3)',
      label: 'Discrepancy Flagged',
    },
  };

  const outcomeColors: Record<string, { bg: string; color: string; border: string }> = {
    VERIFIED: {
      bg: 'rgba(16, 185, 129, 0.15)',
      color: '#34d399',
      border: 'rgba(16, 185, 129, 0.3)',
    },
    DISCREPANCY_FOUND: {
      bg: 'rgba(245, 158, 11, 0.15)',
      color: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.3)',
    },
    INCONCLUSIVE: {
      bg: 'rgba(168, 85, 247, 0.15)',
      color: '#c084fc',
      border: 'rgba(168, 85, 247, 0.3)',
    },
  };

  const statusBadge = statusBadges[report.status] ?? statusBadges.DRAFT;
  const outcomeStyle = outcomeColors[report.outcome ?? ''] ?? {
    bg: 'rgba(148, 163, 184, 0.1)',
    color: '#cbd5e1',
    border: 'rgba(148, 163, 184, 0.2)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      id="field-verification-review-modal"
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '820px',
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
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            background: '#1e293b',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                Report ID: {report.id.slice(0, 8)}...
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
                id="review-modal-revision-badge"
              >
                Revision {report.revisionNumber ?? 1}
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  backgroundColor: statusBadge.bg,
                  color: statusBadge.color,
                  border: `1px solid ${statusBadge.border}`,
                }}
                id="review-modal-status-badge"
              >
                {statusBadge.label}
              </span>
              {report.outcome && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontWeight: 600,
                    backgroundColor: outcomeStyle.bg,
                    color: outcomeStyle.color,
                    border: `1px solid ${outcomeStyle.border}`,
                  }}
                  id="review-modal-outcome-badge"
                >
                  Outcome: {report.outcome}
                </span>
              )}
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
              Field Verification Inspection Review
            </h3>
            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Case <strong style={{ color: '#cbd5e1' }}>{report.case.caseReference}</strong> • Parcel <strong style={{ color: '#cbd5e1' }}>{report.parcel.parcelId}</strong> (Survey #{report.parcel.surveyNumber})
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
            aria-label="Close modal"
            id="close-review-modal-btn"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMessage && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
              id="review-modal-error-banner"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Separation of duties banner */}
          {isAuthor && report.status === 'SUBMITTED' && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fde68a',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
              id="review-separation-of-duties-banner"
            >
              <strong>Separation of Duties Notice:</strong> You authored or submitted this field inspection report. In accordance with system audit integrity, formal review decisions must be conducted independently by another authorized Land Officer.
            </div>
          )}

          {/* Discrepancy Alert Banner */}
          {report.status === 'DISCREPANCY_FLAGGED' && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
              id="review-discrepancy-active-banner"
            >
              <strong>⚠️ Discrepancy Flagged:</strong> This verification report has been formally flagged with an unresolved discrepancy. Further investigation is required before parcel clearance can proceed.
              {report.reviewRemarks && (
                <div style={{ marginTop: '0.4rem', color: '#fff', fontStyle: 'italic' }}>
                  Reason: &ldquo;{report.reviewRemarks}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Returned for Correction Banner */}
          {report.status === 'RETURNED_FOR_CORRECTION' && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#fde68a',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
              id="review-returned-active-banner"
            >
              <strong>↩ Returned for Correction:</strong> This report was returned for adjustments by {report.reviewer?.name || 'Land Officer'} on {report.reviewedAt ? new Date(report.reviewedAt).toLocaleDateString() : 'recent review'}.
              {report.reviewRemarks && (
                <div style={{ marginTop: '0.4rem', color: '#fff' }}>
                  Correction requirements: &ldquo;{report.reviewRemarks}&rdquo;
                </div>
              )}
              {isAuthor && isFieldOfficer && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleInitiateCorrection}
                    disabled={isInitiatingCorrection}
                    className="btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', backgroundColor: '#d97706', borderColor: '#f59e0b' }}
                    id="initiate-correction-btn"
                  >
                    {isInitiatingCorrection ? 'Initiating Draft...' : '+ Create Correction Revision Draft'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Locality & Distinct Area Comparisons */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <h4
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: '0 0 1rem 0',
              }}
            >
              1. Locality & Area Measurements (Distinct Values)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Administrative Locality</span>
                <span style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                  {report.parcel.village}, {report.parcel.taluk}, {report.parcel.district}, {report.parcel.state}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Survey / Subdivision</span>
                <span style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                  Survey #{report.parcel.surveyNumber}
                  {report.parcel.subdivisionNumber ? ` / Subdiv ${report.parcel.subdivisionNumber}` : ''}
                </span>
              </div>
            </div>

            {/* Three distinct area values */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
                background: 'rgba(0, 0, 0, 0.25)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div style={{ padding: '0.5rem', borderLeft: '3px solid #64748b' }}>
                <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  A. Total Recorded Parcel Area
                </span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f1f5f9' }} id="review-area-recorded">
                  {report.parcel.totalArea} {report.parcel.areaUnit}
                </span>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  Official Land Record Register
                </span>
              </div>

              <div style={{ padding: '0.5rem', borderLeft: '3px solid #3b82f6' }}>
                <span style={{ fontSize: '0.6875rem', color: '#93c5fd', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  B. Proposed Affected Area
                </span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#60a5fa' }} id="review-area-proposed">
                  {report.caseParcel.proposedAffectedArea} {report.caseParcel.affectedAreaUnit}
                </span>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  Proposed Acquisition Alignment
                </span>
              </div>

              <div style={{ padding: '0.5rem', borderLeft: '3px solid #10b981' }}>
                <span style={{ fontSize: '0.6875rem', color: '#6ee7b7', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  C. Field-Measured Area
                </span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#34d399' }} id="review-area-measured">
                  {report.measuredArea ? `${report.measuredArea} ${report.measuredAreaUnit}` : 'Not measured'}
                </span>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  {report.measurementMethod ? `Method: ${report.measurementMethod}` : 'Ground inspection'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.75rem', fontStyle: 'italic' }}>
              Notice: Field-measured values and coordinates are recorded for ground inspection verification and do not infer ownership or legally authoritative property boundaries.
            </div>
          </div>

          {/* Section 2: Field Observations & Outcome */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <h4
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: '0 0 1rem 0',
              }}
            >
              2. Field Inspection Observations
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Inspecting Field Officer</span>
                <span style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                  {report.creator.name} ({report.creator.email})
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Inspection Date / Time</span>
                <span style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                  {report.verificationDate ? new Date(report.verificationDate).toLocaleString() : 'Not recorded'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Submission Timestamp</span>
                <span style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                  {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : 'Draft pending'}
                </span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                Field Observations & Findings:
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8125rem',
                  color: '#e2e8f0',
                  lineHeight: '1.5',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap',
                }}
                id="review-observations-content"
              >
                {report.observations || 'No observations recorded.'}
              </p>
            </div>

            {report.measurementNotes && (
              <div style={{ marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                  Measurement Notes:
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    lineHeight: '1.4',
                    background: 'rgba(0, 0, 0, 0.15)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                  }}
                >
                  {report.measurementNotes}
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Evidence & Captions */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: 0,
                }}
              >
                3. Attached Inspection Evidence ({report.evidence?.length ?? 0})
              </h4>
            </div>

            {report.evidence && report.evidence.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {report.evidence.map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                    id={`review-evidence-item-${idx}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                        }}
                      >
                        {ev.evidenceType}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                        {ev.createdAt ? new Date(ev.createdAt).toLocaleDateString() : ''}
                      </span>
                    </div>

                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#f1f5f9' }}>
                      📁 {ev.fileReference}
                    </div>

                    {ev.caption && (
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 500 }}>
                        {ev.caption}
                      </div>
                    )}

                    {ev.description && (
                      <div style={{ fontSize: '0.6875rem', color: '#94a3b8', lineHeight: 1.3 }}>
                        {ev.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                No evidence items attached to this report.
              </p>
            )}
          </div>

          {/* Section 4: Auditable Review History */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <h4
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: '0 0 0.75rem 0',
              }}
            >
              4. Review Decision History ({report.reviews?.length ?? 0})
            </h4>

            {report.reviews && report.reviews.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {report.reviews.map((rev) => {
                  const revBadge = statusBadges[rev.decision] ?? statusBadges.ACCEPTED;
                  return (
                    <div
                      key={rev.id}
                      style={{
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderLeft: `3px solid ${revBadge.color}`,
                        padding: '0.6rem 0.8rem',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                      id={`review-history-${rev.id}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: revBadge.color }}>
                          {revBadge.label}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                          {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                      {rev.remarks && (
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#cbd5e1' }}>
                          &ldquo;{rev.remarks}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                No prior review actions recorded for this report.
              </p>
            )}
          </div>

          {/* Section 5: Land Officer Review Action Form */}
          {canReview && (
            <form
              onSubmit={handleReviewSubmit}
              style={{
                background: '#1e293b',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
              id="land-officer-review-form"
            >
              <div>
                <h4
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#60a5fa',
                    margin: '0 0 0.25rem 0',
                  }}
                >
                  Record Land Officer Review Decision
                </h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                  As an independent Land Officer, examine the field observations and evidence to record a formal decision.
                </p>
              </div>

              {/* Decision Options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    background: decision === 'ACCEPTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0,0,0,0.2)',
                    border: decision === 'ACCEPTED' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="reviewDecision"
                    value="ACCEPTED"
                    checked={decision === 'ACCEPTED'}
                    onChange={() => setDecision('ACCEPTED')}
                    style={{ marginTop: '0.2rem' }}
                    id="decision-radio-accepted"
                  />
                  <div>
                    <strong style={{ color: '#34d399', fontSize: '0.8125rem', display: 'block' }}>
                      ✓ Accept Report
                    </strong>
                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                      Verification findings and evidence are accepted.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    background: decision === 'RETURNED_FOR_CORRECTION' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0,0,0,0.2)',
                    border: decision === 'RETURNED_FOR_CORRECTION' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="reviewDecision"
                    value="RETURNED_FOR_CORRECTION"
                    checked={decision === 'RETURNED_FOR_CORRECTION'}
                    onChange={() => setDecision('RETURNED_FOR_CORRECTION')}
                    style={{ marginTop: '0.2rem' }}
                    id="decision-radio-returned"
                  />
                  <div>
                    <strong style={{ color: '#fbbf24', fontSize: '0.8125rem', display: 'block' }}>
                      ↩ Return for Correction
                    </strong>
                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                      Field Officer must adjust findings/evidence (remarks mandatory).
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    background: decision === 'DISCREPANCY_FLAGGED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.2)',
                    border: decision === 'DISCREPANCY_FLAGGED' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="reviewDecision"
                    value="DISCREPANCY_FLAGGED"
                    checked={decision === 'DISCREPANCY_FLAGGED'}
                    onChange={() => setDecision('DISCREPANCY_FLAGGED')}
                    style={{ marginTop: '0.2rem' }}
                    id="decision-radio-discrepancy"
                  />
                  <div>
                    <strong style={{ color: '#f87171', fontSize: '0.8125rem', display: 'block' }}>
                      ⚠️ Flag Discrepancy
                    </strong>
                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                      Ground discrepancy flagged; requires further investigation.
                    </span>
                  </div>
                </label>
              </div>

              {/* Remarks Textarea */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: '0.25rem',
                  }}
                >
                  Review Remarks / Reason {decision !== 'ACCEPTED' ? '(Mandatory)' : '(Optional)'}:
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  placeholder={
                    decision === 'RETURNED_FOR_CORRECTION'
                      ? 'Specify the exact items or measurements needing correction by the field officer...'
                      : decision === 'DISCREPANCY_FLAGGED'
                      ? 'Explain the discrepancy found between official records and field inspection...'
                      : 'Optional review notes or observations...'
                  }
                  className="form-input"
                  style={{ width: '100%', resize: 'vertical' }}
                  id="review-remarks-input"
                />
              </div>

              {/* Confirmation Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  id="confirm-decision-checkbox"
                />
                <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                  I confirm this formal Land Officer review decision. This decision is auditable and permanent.
                </span>
              </label>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  style={{ fontSize: '0.8125rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isConfirmed}
                  className="btn-primary"
                  style={{
                    fontSize: '0.8125rem',
                    backgroundColor:
                      decision === 'ACCEPTED'
                        ? '#059669'
                        : decision === 'RETURNED_FOR_CORRECTION'
                        ? '#d97706'
                        : '#dc2626',
                    borderColor:
                      decision === 'ACCEPTED'
                        ? '#10b981'
                        : decision === 'RETURNED_FOR_CORRECTION'
                        ? '#f59e0b'
                        : '#ef4444',
                  }}
                  id="submit-review-decision-btn"
                >
                  {isSubmitting ? 'Recording Decision...' : `Confirm & Record: ${decision}`}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#1e293b',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            NLAMS Step 5B • Land Officer Field Verification Review
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ fontSize: '0.8125rem' }}
            id="close-modal-bottom-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

