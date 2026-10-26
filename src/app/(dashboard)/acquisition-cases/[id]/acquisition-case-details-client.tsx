'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { AcquisitionCaseWithRelations } from '../../../../repositories/acquisition-case.repository';
import type { AcquisitionCaseStatus } from '../../../../../db/schema/acquisition-cases';

interface AcquisitionCaseDetailsClientProps {
  caseId: string;
  currentUserId: string;
  userPermissions: string[];
  userRoles: string[];
  isSuperAdmin: boolean;
}

const STATUS_BADGE_STYLES: Record<
  AcquisitionCaseStatus,
  { bg: string; color: string; border: string; label: string }
> = {
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
    label: 'Submitted for Review',
  },
  AWAITING_FIELD_VERIFICATION: {
    bg: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: 'rgba(16, 185, 129, 0.3)',
    label: 'Awaiting Field Verification',
  },
  RETURNED_FOR_CORRECTION: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'Returned for Correction',
  },
  REJECTED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
};

export function AcquisitionCaseDetailsClient({
  caseId,
  currentUserId,
  userPermissions,
  userRoles,
  isSuperAdmin,
}: AcquisitionCaseDetailsClientProps) {
  const isLandOfficer = isSuperAdmin || userRoles.includes('LAND_OFFICER');
  const canUpdate = (isSuperAdmin || userPermissions.includes('ACQUISITION_CASE_UPDATE')) && isLandOfficer;
  const canSubmit = (isSuperAdmin || userPermissions.includes('ACQUISITION_CASE_SUBMIT')) && isLandOfficer;
  const canReview = isSuperAdmin || userPermissions.includes('ACQUISITION_CASE_REVIEW');
  const canAuthorizeField = isSuperAdmin || userPermissions.includes('FIELD_VERIFICATION_AUTHORIZE');
  const hasReviewPermission = canReview || canAuthorizeField;

  const [acqCase, setAcqCase] = useState<AcquisitionCaseWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Submit Modal State
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submissionRemarks, setSubmissionRemarks] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'PERMIT_FIELD_VERIFICATION' | 'RETURN_FOR_CORRECTION' | 'REJECT'>('PERMIT_FIELD_VERIFICATION');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [isDecisionConfirmed, setIsDecisionConfirmed] = useState(false);
  const [isRecordingDecision, setIsRecordingDecision] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadCase = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Acquisition case not found or outside your authorized administrative scope.');
        }
        if (res.status === 403) {
          throw new Error('You do not have permission to view this acquisition case.');
        }
        throw new Error('Failed to load acquisition case details.');
      }

      const json = await res.json();
      if (json.success) {
        setAcqCase(json.data);
      } else {
        throw new Error(json.error || 'Failed to load case');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  // Open Edit Modal
  const handleOpenEdit = () => {
    if (!acqCase) return;
    setEditTitle(acqCase.title);
    setEditDescription(acqCase.description ?? '');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (editTitle.trim().length < 3) {
      setEditError('Title must be at least 3 characters.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update case');
      }

      setAcqCase(json.data);
      setIsEditModalOpen(false);
      setSuccessMessage('Case details updated successfully.');
    } catch (err: unknown) {
      setEditError(
        err instanceof Error ? err.message : 'An error occurred updating case'
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Submit Modal
  const handleOpenSubmit = () => {
    setSubmissionRemarks('');
    setSubmitError(null);
    setIsSubmitModalOpen(true);
  };

  // Execute Submit for Review
  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remarks: submissionRemarks.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit case for review');
      }

      setAcqCase(json.data);
      setIsSubmitModalOpen(false);
      setSuccessMessage('Acquisition case submitted for review successfully.');
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'An error occurred during submission'
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Open Review Decision Modal
  const handleOpenReview = (
    decision: 'PERMIT_FIELD_VERIFICATION' | 'RETURN_FOR_CORRECTION' | 'REJECT'
  ) => {
    setReviewDecision(decision);
    setReviewRemarks('');
    setIsDecisionConfirmed(false);
    setReviewError(null);
    setIsReviewModalOpen(true);
  };

  // Confirm and Record Review Decision
  const handleConfirmReviewDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError(null);

    const trimmedRemarks = reviewRemarks.trim();
    if (reviewDecision === 'RETURN_FOR_CORRECTION' && !trimmedRemarks) {
      setReviewError('Remarks are required when returning a case for correction.');
      return;
    }
    if (reviewDecision === 'REJECT' && !trimmedRemarks) {
      setReviewError('A reason is required when rejecting an acquisition case.');
      return;
    }

    if (!isDecisionConfirmed) {
      setReviewError('Please check the confirmation box to authorize this decision.');
      return;
    }

    setIsRecordingDecision(true);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: reviewDecision,
          remarks: trimmedRemarks || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to record review decision');
      }

      setAcqCase(json.data);
      setIsReviewModalOpen(false);
      setSuccessMessage(
        reviewDecision === 'PERMIT_FIELD_VERIFICATION'
          ? 'Field verification authorized successfully. Case is now Awaiting Field Verification.'
          : reviewDecision === 'RETURN_FOR_CORRECTION'
          ? 'Case successfully returned for correction.'
          : 'Acquisition case has been formally rejected.'
      );
    } catch (err: unknown) {
      setReviewError(
        err instanceof Error ? err.message : 'An error occurred recording review decision'
      );
    } finally {
      setIsRecordingDecision(false);
    }
  };

  if (isLoading) {
    return (
      <div className="users-page-container">
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading acquisition case details...</span>
        </div>
      </div>
    );
  }

  if (errorMessage || !acqCase) {
    return (
      <div className="users-page-container">
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span>{errorMessage ?? 'Case not found'}</span>
        </div>
        <Link href="/acquisition-cases" className="btn-secondary" style={{ display: 'inline-block' }}>
          ← Back to Acquisition Cases
        </Link>
      </div>
    );
  }

  const isEditable = acqCase.status === 'DRAFT' || acqCase.status === 'RETURNED_FOR_CORRECTION';
  const canPerformEdit = isEditable && canUpdate;
  const canPerformSubmit = isEditable && canSubmit;

  // Separation-of-duties: reviewer cannot be project creator or case preparer.
  // Counterpart-role: if project created by PROJECT_OFFICER, reviewer must have MINISTRY_ADMIN (and vice versa).
  const isProjectCreator = currentUserId === acqCase.project.createdBy;
  const isCasePreparer = currentUserId === acqCase.createdBy;
  const projectCreatorRoles: string[] = (acqCase.project as { creatorRoles?: string[] }).creatorRoles ?? [];
  // Determine required counterpart role from project creator role
  let requiredCounterpartRole: string | null = null;
  if (projectCreatorRoles.includes('PROJECT_OFFICER')) {
    requiredCounterpartRole = 'MINISTRY_ADMIN';
  } else if (projectCreatorRoles.includes('MINISTRY_ADMIN')) {
    requiredCounterpartRole = 'PROJECT_OFFICER';
  }
  const holdsCounterpartRole = requiredCounterpartRole
    ? userRoles.includes(requiredCounterpartRole)
    : true; // No counterpart requirement (e.g. SUPER_ADMIN-created project)

  // Eligible reviewer: has review permission + is not project creator + is not case preparer + holds required counterpart role
  const isEligibleReviewer =
    hasReviewPermission && !isProjectCreator && !isCasePreparer && holdsCounterpartRole;

  // Determine why the user cannot review (for informative banner)
  const reviewIneligibilityReason: string | null = hasReviewPermission
    ? isProjectCreator
      ? 'You created the linked project. Independent counterpart-role review is required — the project creator cannot review the acquisition case for their own project.'
      : isCasePreparer
        ? 'You prepared this acquisition case. The Land Officer who submitted the case cannot review it.'
        : !holdsCounterpartRole && requiredCounterpartRole
          ? `Counterpart-role review is required. This project was created by a ${projectCreatorRoles.includes('PROJECT_OFFICER') ? 'Project Officer' : 'Ministry Admin'}, so the reviewer must hold the '${requiredCounterpartRole}' role. Your current roles do not include '${requiredCounterpartRole}'.`
          : null
    : null;

  const badge = STATUS_BADGE_STYLES[acqCase.status as AcquisitionCaseStatus] ?? {
    bg: 'rgba(100,116,139,0.12)',
    color: '#94a3b8',
    border: 'rgba(100,116,139,0.3)',
    label: acqCase.status,
  };

  return (
    <div className="users-page-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Breadcrumb Navigation */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          href="/acquisition-cases"
          style={{
            fontSize: '0.8125rem',
            color: '#94a3b8',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginBottom: '0.5rem',
            textDecoration: 'none',
          }}
        >
          ← Back to Acquisition Cases
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.125rem', color: '#60a5fa' }} id="case-reference-badge">
                {acqCase.caseReference}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                }}
                id="case-status-badge"
              >
                {badge.label}
              </span>
            </div>
            <h1 className="users-page-title" style={{ fontSize: '1.5rem', margin: 0 }} id="case-title">
              {acqCase.title}
            </h1>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {canPerformEdit && (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="btn-secondary"
                id="edit-case-btn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Details
              </button>
            )}

            {canPerformSubmit && (
              <button
                type="button"
                onClick={handleOpenSubmit}
                className="btn-primary"
                id="submit-case-btn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Submit for Review
              </button>
            )}

            {acqCase.status === 'SUBMITTED' && isEligibleReviewer && (
              <button
                type="button"
                onClick={() =>
                  handleOpenReview(canAuthorizeField ? 'PERMIT_FIELD_VERIFICATION' : 'RETURN_FOR_CORRECTION')
                }
                className="btn-primary"
                style={{ backgroundColor: '#059669', borderColor: '#10b981' }}
                id="header-review-case-btn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Review Decision
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#6ee7b7',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          id="case-success-banner"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Status Alerts & Review Panels */}
      {acqCase.status === 'SUBMITTED' && isEligibleReviewer && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.28)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
          id="review-action-banner"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ color: '#60a5fa', fontSize: '0.9375rem', fontWeight: 600 }}>
                  Case Pending Review & Authorization
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
                As the authorized counterpart official, review the acquisition case requirements and record a formal workflow decision.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
              {canAuthorizeField && (
                <button
                  type="button"
                  onClick={() => handleOpenReview('PERMIT_FIELD_VERIFICATION')}
                  className="btn-primary"
                  style={{ backgroundColor: '#059669', borderColor: '#10b981', fontSize: '0.8125rem' }}
                  id="permit-field-verification-btn"
                >
                  ✓ Permit Field Verification
                </button>
              )}
              {canReview && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenReview('RETURN_FOR_CORRECTION')}
                    className="btn-secondary"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.5)', color: '#fbbf24', fontSize: '0.8125rem' }}
                    id="return-case-btn"
                  >
                    ↩ Return for Correction
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenReview('REJECT')}
                    className="btn-secondary"
                    style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#f87171', fontSize: '0.8125rem' }}
                    id="reject-case-btn"
                  >
                    ✕ Reject Case
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {acqCase.status === 'SUBMITTED' && !isEligibleReviewer && (
        <div
          style={{
            background: reviewIneligibilityReason
              ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(59, 130, 246, 0.08)',
            border: reviewIneligibilityReason
              ? '1px solid rgba(245, 158, 11, 0.3)'
              : '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: reviewIneligibilityReason ? '#fde68a' : '#93c5fd',
          }}
          id="no-review-permission-banner"
        >
          <strong>Case Submitted for Review:</strong>{' '}
          {reviewIneligibilityReason
            ? reviewIneligibilityReason
            : 'This case is locked from direct editing. An authorized counterpart official will review the acquisition details to decide whether to permit field verification, return for correction, or reject.'}
        </div>
      )}

      {acqCase.status === 'AWAITING_FIELD_VERIFICATION' && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: '#6ee7b7',
          }}
          id="awaiting-verification-banner"
        >
          <strong>Field Verification Authorized:</strong> This case has been reviewed and permitted for field verification. Ground survey and field verification activities are now authorized to commence. (Note: Permission to conduct field verification is administrative and does not constitute statutory authorization to acquire land.)
        </div>
      )}

      {acqCase.status === 'RETURNED_FOR_CORRECTION' && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: '#fde68a',
          }}
          id="returned-for-correction-banner"
        >
          <strong>Returned for Correction:</strong>{' '}
          {isLandOfficer
            ? 'This case has been returned for adjustments by a reviewer. You may update the details and resubmit the case for review.'
            : 'This case has been returned for adjustments by a reviewer. Only an authorized Land Officer may edit the details and resubmit the case for review.'}
        </div>
      )}

      {acqCase.status === 'DRAFT' && !isLandOfficer && (
        <div
          style={{
            background: 'rgba(100, 116, 139, 0.08)',
            border: '1px solid rgba(100, 116, 139, 0.2)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
          }}
          id="draft-non-land-officer-banner"
        >
          <strong>Draft Case (Read-Only):</strong> Acquisition case preparation, editing, and submission for review are restricted to Land Officers.
        </div>
      )}

      {acqCase.status === 'REJECTED' && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: '#f87171',
          }}
          id="rejected-case-banner"
        >
          <strong>Case Rejected:</strong> This acquisition case has been reviewed and rejected. No further actions or resubmissions may be performed on this case.
        </div>
      )}

      {/* Two Column Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Linked Project Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Linked Infrastructure Project</h2>
            <Link
              href={`/projects/${acqCase.project.id}`}
              style={{ fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none' }}
            >
              View Project →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Project Name</span>
              <strong style={{ color: '#fff' }}>{acqCase.project.name}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Project Code</span>
                <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{acqCase.project.projectCode}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Project Type</span>
                <span style={{ color: '#cbd5e1' }}>{acqCase.project.projectType}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Administrative Unit</span>
                <span style={{ color: '#cbd5e1' }}>
                  {acqCase.project.administrativeUnit?.name} ({acqCase.project.administrativeUnit?.code})
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Implementing Agency</span>
                <span style={{ color: '#cbd5e1' }}>{acqCase.project.implementingAgency?.name}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Case Metadata Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1rem 0' }}>Case Information</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Created On</span>
                <span style={{ color: '#cbd5e1' }}>{new Date(acqCase.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Initiated By</span>
                <span style={{ color: '#cbd5e1' }}>{acqCase.creator.name}</span>
              </div>
            </div>

            {acqCase.submittedAt && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Submitted On</span>
                  <span style={{ color: '#cbd5e1' }}>{new Date(acqCase.submittedAt).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Submission Remarks</span>
                  <span style={{ color: '#cbd5e1' }}>{acqCase.submissionRemarks || 'None provided'}</span>
                </div>
              </div>
            )}

            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Description</span>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.8125rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {acqCase.description || 'No description provided.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow History Section */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1rem 0' }}>
          Workflow Audit History
        </h2>
        <p style={{ fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
          Complete, tamper-evident audit record of all state transitions and operational actions for this case.
        </p>

        {!acqCase.workflowHistory || acqCase.workflowHistory.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>No workflow history entries found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
            {acqCase.workflowHistory.map((item, idx) => {
              const getActionMeta = () => {
                switch (item.action) {
                  case 'CREATE':
                    return { icon: '★', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '#3b82f6', label: 'Case Draft Created' };
                  case 'SUBMIT':
                    return { icon: '➔', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '#3b82f6', label: 'Submitted for Review' };
                  case 'PERMIT_FIELD_VERIFICATION':
                  case 'AUTHORIZE_FIELD_VERIFICATION':
                    return { icon: '✓', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '#10b981', label: 'Field Verification Authorized' };
                  case 'RETURN_FOR_CORRECTION':
                    return { icon: '↩', bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '#f59e0b', label: 'Returned for Correction' };
                  case 'REJECT':
                    return { icon: '✕', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '#ef4444', label: 'Case Rejected' };
                  default:
                    return { icon: '•', bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '#64748b', label: item.action };
                }
              };
              const meta = getActionMeta();

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    paddingBottom: idx !== (acqCase.workflowHistory?.length ?? 0) - 1 ? '1rem' : 0,
                    borderBottom: idx !== (acqCase.workflowHistory?.length ?? 0) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                  id={`history-item-${item.id}`}
                >
                  {/* Timeline Icon */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: meta.bg,
                      color: meta.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontWeight: 700,
                    }}
                  >
                    {meta.icon}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ color: '#fff', fontSize: '0.875rem' }}>
                          {meta.label}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          ({item.fromStatus ? `${item.fromStatus} → ` : ''}{item.toStatus})
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                      <span>Reviewer/Actor: <strong>{item.actor.name}</strong> ({item.actor.email})</span>
                    </div>

                    {item.remarks && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.8125rem',
                          color: '#cbd5e1',
                          background: 'rgba(0,0,0,0.2)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${meta.border}`,
                        }}
                      >
                        {item.remarks}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Case Modal */}
      {isEditModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '560px',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', margin: '0 0 1rem 0' }}>
              Edit Acquisition Case
            </h3>

            {editError && (
              <div className="alert-banner-error" role="alert" style={{ marginBottom: '1rem' }} id="edit-error-banner">
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="edit-case-title"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                >
                  Case Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="edit-case-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="users-search-input"
                  style={{ width: '100%', height: '40px' }}
                  minLength={3}
                  maxLength={255}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="edit-case-desc"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                >
                  Description
                </label>
                <textarea
                  id="edit-case-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="users-search-input"
                  style={{ width: '100%', minHeight: '90px', padding: '0.75rem' }}
                  maxLength={2000}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn-secondary"
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn-primary"
                  id="save-edit-btn"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit for Review Modal */}
      {isSubmitModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '560px',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', margin: '0 0 0.5rem 0' }}>
              Confirm Submission for Review
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 1rem 0' }}>
              Submitting this case changes its status to <strong>SUBMITTED</strong>. Once submitted, the case is locked
              from direct edits while authorized officials review the requirements.
            </p>

            {submitError && (
              <div className="alert-banner-error" role="alert" style={{ marginBottom: '1rem' }} id="submit-error-banner">
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="submit-remarks-input"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.375rem' }}
                >
                  Submission Remarks <span style={{ color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <textarea
                  id="submit-remarks-input"
                  placeholder="Add any notes for the reviewing official..."
                  value={submissionRemarks}
                  onChange={(e) => setSubmissionRemarks(e.target.value)}
                  className="users-search-input"
                  style={{ width: '100%', minHeight: '80px', padding: '0.75rem' }}
                  maxLength={1000}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="btn-secondary"
                  disabled={isSubmittingReview}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="btn-primary"
                  id="confirm-submit-review-btn"
                >
                  {isSubmittingReview ? 'Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Decision Modal */}
      {isReviewModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem',
          }}
          id="review-decision-modal-overlay"
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '580px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            }}
            id="review-decision-modal"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', margin: '0 0 0.25rem 0' }}>
                  Record Review Decision
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
                  Case: <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{acqCase.caseReference}</span> — {acqCase.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
                disabled={isRecordingDecision}
              >
                ✕
              </button>
            </div>

            {reviewError && (
              <div className="alert-banner-error" role="alert" style={{ marginBottom: '1rem' }} id="review-error-banner">
                <span>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReviewDecision}>
              {/* Decision Options */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem' }}>
                  Select Review Decision <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  {canAuthorizeField && (
                    <button
                      type="button"
                      onClick={() => setReviewDecision('PERMIT_FIELD_VERIFICATION')}
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: '8px',
                        border: reviewDecision === 'PERMIT_FIELD_VERIFICATION' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                        background: reviewDecision === 'PERMIT_FIELD_VERIFICATION' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)',
                        color: reviewDecision === 'PERMIT_FIELD_VERIFICATION' ? '#34d399' : '#94a3b8',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                      id="radio-permit-verification"
                    >
                      ✓ Permit Field Verification
                    </button>
                  )}
                  {canReview && (
                    <>
                      <button
                        type="button"
                        onClick={() => setReviewDecision('RETURN_FOR_CORRECTION')}
                        style={{
                          padding: '0.625rem 0.75rem',
                          borderRadius: '8px',
                          border: reviewDecision === 'RETURN_FOR_CORRECTION' ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                          background: reviewDecision === 'RETURN_FOR_CORRECTION' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)',
                          color: reviewDecision === 'RETURN_FOR_CORRECTION' ? '#fbbf24' : '#94a3b8',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                        id="radio-return-correction"
                      >
                        ↩ Return for Correction
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewDecision('REJECT')}
                        style={{
                          padding: '0.625rem 0.75rem',
                          borderRadius: '8px',
                          border: reviewDecision === 'REJECT' ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                          background: reviewDecision === 'REJECT' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.03)',
                          color: reviewDecision === 'REJECT' ? '#f87171' : '#94a3b8',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                        id="radio-reject-case"
                      >
                        ✕ Reject Case
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Consequence note */}
              <div
                style={{
                  background:
                    reviewDecision === 'PERMIT_FIELD_VERIFICATION'
                      ? 'rgba(16, 185, 129, 0.08)'
                      : reviewDecision === 'RETURN_FOR_CORRECTION'
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                  border:
                    reviewDecision === 'PERMIT_FIELD_VERIFICATION'
                      ? '1px solid rgba(16, 185, 129, 0.25)'
                      : reviewDecision === 'RETURN_FOR_CORRECTION'
                      ? '1px solid rgba(245, 158, 11, 0.25)'
                      : '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8125rem',
                  color:
                    reviewDecision === 'PERMIT_FIELD_VERIFICATION'
                      ? '#6ee7b7'
                      : reviewDecision === 'RETURN_FOR_CORRECTION'
                      ? '#fde68a'
                      : '#fca5a5',
                  marginBottom: '1.25rem',
                }}
              >
                {reviewDecision === 'PERMIT_FIELD_VERIFICATION' && (
                  <span>
                    <strong>Result: Awaiting Field Verification.</strong> Authorizes field officers to conduct field verification surveys within the project boundary. (Note: This is administrative survey authorization, not statutory land acquisition.)
                  </span>
                )}
                {reviewDecision === 'RETURN_FOR_CORRECTION' && (
                  <span>
                    <strong>Result: Returned for Correction.</strong> The case returns to editable status for the submitting officer. Remarks specifying required adjustments are mandatory.
                  </span>
                )}
                {reviewDecision === 'REJECT' && (
                  <span>
                    <strong>Result: Rejected (Terminal).</strong> Formally rejects the acquisition case. No further modifications or resubmissions are permitted. A mandatory rejection reason is required.
                  </span>
                )}
              </div>

              {/* Remarks / Reason textarea */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <label
                    htmlFor="review-decision-remarks"
                    style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9' }}
                  >
                    {reviewDecision === 'RETURN_FOR_CORRECTION' ? (
                      <>Correction Remarks <span style={{ color: '#ef4444' }}>*</span></>
                    ) : reviewDecision === 'REJECT' ? (
                      <>Rejection Reason <span style={{ color: '#ef4444' }}>*</span></>
                    ) : (
                      <>Review Remarks <span style={{ color: '#64748b', fontWeight: 400 }}>(Optional)</span></>
                    )}
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {reviewRemarks.length}/1000
                  </span>
                </div>
                <textarea
                  id="review-decision-remarks"
                  placeholder={
                    reviewDecision === 'RETURN_FOR_CORRECTION'
                      ? 'Specify the required corrections or missing documentation...'
                      : reviewDecision === 'REJECT'
                      ? 'Enter the formal reason for rejecting this acquisition case...'
                      : 'Add any operational guidance for the field verification team...'
                  }
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  className="users-search-input"
                  style={{ width: '100%', minHeight: '90px', padding: '0.75rem' }}
                  maxLength={1000}
                />
              </div>

              {/* Confirmation Checkbox */}
              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}
              >
                <input
                  type="checkbox"
                  id="confirm-decision-checkbox"
                  checked={isDecisionConfirmed}
                  onChange={(e) => setIsDecisionConfirmed(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#3b82f6' }}
                />
                <label
                  htmlFor="confirm-decision-checkbox"
                  style={{ fontSize: '0.8125rem', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}
                >
                  I confirm that I have evaluated this case and authorize recording this workflow decision.
                </label>
              </div>

              {/* Modal Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="btn-secondary"
                  disabled={isRecordingDecision}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isRecordingDecision ||
                    !isDecisionConfirmed ||
                    (reviewDecision === 'RETURN_FOR_CORRECTION' && !reviewRemarks.trim()) ||
                    (reviewDecision === 'REJECT' && !reviewRemarks.trim())
                  }
                  className="btn-primary"
                  style={{
                    backgroundColor:
                      reviewDecision === 'PERMIT_FIELD_VERIFICATION'
                        ? '#059669'
                        : reviewDecision === 'RETURN_FOR_CORRECTION'
                        ? '#d97706'
                        : '#dc2626',
                    borderColor:
                      reviewDecision === 'PERMIT_FIELD_VERIFICATION'
                        ? '#10b981'
                        : reviewDecision === 'RETURN_FOR_CORRECTION'
                        ? '#f59e0b'
                        : '#ef4444',
                  }}
                  id="submit-review-decision-btn"
                >
                  {isRecordingDecision ? 'Recording Decision...' : 'Confirm Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
