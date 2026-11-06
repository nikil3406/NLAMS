'use client';

import React, { useState } from 'react';
import type { CaseCompletionEligibility, UnmetCondition } from '../../../../services/acquisition-cases';

interface CaseVerificationCompletionCardProps {
  caseId: string;
  caseStatus: string;
  eligibility: CaseCompletionEligibility | null;
  isLoading: boolean;
  isVerifiedLandOfficer: boolean;
  onCompleted: () => void;
}

export function CaseVerificationCompletionCard({
  caseId,
  caseStatus,
  eligibility,
  isLoading,
  isVerifiedLandOfficer,
  onCompleted,
}: CaseVerificationCompletionCardProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (caseStatus === 'FIELD_VERIFICATION_COMPLETED') {
    return (
      <div
        style={{
          background: 'rgba(5, 150, 105, 0.12)',
          border: '1px solid rgba(5, 150, 105, 0.35)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '2rem',
        }}
        id="case-completion-success-card"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>✅</span>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#34d399', margin: '0 0 0.25rem 0' }}>
              Field Verification Completed
            </h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#a7f3d0' }}>
              All required land parcels have been verified, reports accepted, discrepancies formally resolved, and audit requirements satisfied.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (caseStatus !== 'AWAITING_FIELD_VERIFICATION') {
    return null;
  }

  const handleComplete = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/acquisition-cases/${caseId}/verification-completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: remarks.trim() || undefined }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to complete field verification');
      }

      setIsConfirmOpen(false);
      onCompleted();
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred during completion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEligible = eligibility?.isEligible ?? false;

  return (
    <>
      <div
        style={{
          background: '#1e293b',
          border: isEligible
            ? '1px solid rgba(16, 185, 129, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '2rem',
        }}
        id="case-completion-status-card"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                Field Verification Completion Status
              </h3>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  background: isEligible ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isEligible ? '#34d399' : '#f87171',
                  border: `1px solid ${isEligible ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
                id="completion-eligibility-badge"
              >
                {isLoading ? 'Checking eligibility...' : isEligible ? 'Eligible for Completion' : 'Requirements Outstanding'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
              Requires all parcels accepted by a verified Land Officer, zero reports awaiting review, all discrepancies resolved, and complete evidence/audit logs.
            </p>
          </div>

          {isVerifiedLandOfficer && isEligible && (
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setIsConfirmOpen(true);
              }}
              className="btn-primary"
              style={{
                background: '#059669',
                borderColor: '#10b981',
                padding: '0.45rem 1rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              id="complete-verification-action-btn"
            >
              <span>✓</span> Complete Field Verification
            </button>
          )}
        </div>

        {/* Readiness Summary Metrics */}
        {eligibility && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Required Parcels</span>
              <strong style={{ fontSize: '1.125rem', color: '#f1f5f9' }} id="eligibility-total-parcels">
                {eligibility.totalRequiredParcels}
              </strong>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Accepted Parcels</span>
              <strong
                style={{
                  fontSize: '1.125rem',
                  color: eligibility.acceptedParcels === eligibility.totalRequiredParcels && eligibility.totalRequiredParcels > 0 ? '#34d399' : '#fbbf24',
                }}
                id="eligibility-accepted-parcels"
              >
                {eligibility.acceptedParcels} / {eligibility.totalRequiredParcels}
              </strong>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Reports Awaiting Review</span>
              <strong
                style={{
                  fontSize: '1.125rem',
                  color: eligibility.reportsAwaitingReview > 0 ? '#f87171' : '#34d399',
                }}
                id="eligibility-awaiting-reports"
              >
                {eligibility.reportsAwaitingReview}
              </strong>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Unresolved Discrepancies</span>
              <strong
                style={{
                  fontSize: '1.125rem',
                  color: eligibility.unresolvedDiscrepancies > 0 ? '#f87171' : '#34d399',
                }}
                id="eligibility-unresolved-discrepancies"
              >
                {eligibility.unresolvedDiscrepancies}
              </strong>
            </div>
          </div>
        )}

        {/* Unmet Conditions Breakdown */}
        {eligibility && !isEligible && eligibility.unmetConditions.length > 0 && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              fontSize: '0.8125rem',
            }}
            id="completion-unmet-reasons-box"
          >
            <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: '0.4rem' }}>
              Outstanding Requirements Before Completion:
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {eligibility.unmetConditions.map((cond: UnmetCondition, idx: number) => (
                <li key={idx} style={{ color: '#fecaca' }}>
                  {cond.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
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
          id="complete-verification-modal"
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: '0 0 0.5rem 0' }}>
              Confirm Field Verification Completion
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
              You are about to formally certify and complete the field verification phase for this acquisition case.
              Once completed, parcel verifications are permanently locked, and the case status transitions to FIELD_VERIFICATION_COMPLETED.
            </p>

            {submitError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {submitError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.35rem',
                }}
              >
                Formal Completion Remarks (Optional)
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter remarks or certification notes regarding verification completion..."
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '0.6rem',
                  color: '#fff',
                  fontSize: '0.8125rem',
                  resize: 'vertical',
                }}
                id="completion-remarks-input"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="btn-secondary"
                disabled={isSubmitting}
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8125rem' }}
                id="cancel-completion-modal-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="btn-primary"
                disabled={isSubmitting}
                style={{
                  background: '#059669',
                  borderColor: '#10b981',
                  padding: '0.4rem 1rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
                id="confirm-complete-verification-btn"
              >
                {isSubmitting ? 'Completing...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
