'use client';

import React from 'react';

interface ConfirmSubmitReportModalProps {
  parcelInfo: {
    parcelId: string;
    surveyNumber: string;
    village: string;
  };
  reportData: {
    verificationDate: string;
    outcome: string;
    observations: string;
    measuredArea?: number | string | null;
    measuredAreaUnit?: string | null;
    evidenceCount: number;
  };
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSubmitReportModal({
  parcelInfo,
  reportData,
  isSubmitting,
  onConfirm,
  onCancel,
}: ConfirmSubmitReportModalProps) {
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

  const outcomeStyle = outcomeColors[reportData.outcome] || {
    bg: 'rgba(148, 163, 184, 0.15)',
    color: '#cbd5e1',
    border: 'rgba(148, 163, 184, 0.3)',
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
        zIndex: 80,
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      id="confirm-submit-report-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '540px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        id="confirm-submit-report-modal"
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
          >
            📋
          </div>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
              Submit Field Verification Report
            </h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Confirm inspection findings before locking for Land Officer review
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Summary Box */}
          <div
            style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '1rem',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.8125rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Target Parcel</span>
              <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                {parcelInfo.parcelId} (Survey #{parcelInfo.surveyNumber}, {parcelInfo.village})
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Inspection Date</span>
              <span style={{ color: '#f1f5f9' }}>
                {reportData.verificationDate
                  ? new Date(reportData.verificationDate).toLocaleString()
                  : 'Not specified'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Verification Finding</span>
              <span
                style={{
                  background: outcomeStyle.bg,
                  color: outcomeStyle.color,
                  border: `1px solid ${outcomeStyle.border}`,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              >
                {reportData.outcome}
              </span>
            </div>

            {reportData.measuredArea ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Field-Measured Area</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                  {reportData.measuredArea} {reportData.measuredAreaUnit}
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>Attached Evidence</span>
              <span style={{ color: reportData.evidenceCount > 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                {reportData.evidenceCount} item(s) attached
              </span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Observations Summary</span>
              <p
                style={{
                  margin: 0,
                  color: '#cbd5e1',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  lineHeight: '1.4',
                  maxHeight: '80px',
                  overflowY: 'auto',
                }}
              >
                {reportData.observations || 'None'}
              </p>
            </div>
          </div>

          {/* Legal / Workflow Advisory Banner */}
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '0.875rem',
              fontSize: '0.75rem',
              color: '#fef3c7',
              lineHeight: '1.45',
            }}
          >
            <strong>Official Submission Notice:</strong>
            <ul style={{ margin: '0.35rem 0 0 1.25rem', padding: 0 }}>
              <li>Submitting locks this report as an immutable historical inspection record.</li>
              <li>This records the Field Officer’s verified ground findings for Land Officer review.</li>
              <li>It does not automatically verify, accept, or complete the acquisition case.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn-secondary"
            id="cancel-submit-report-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="btn-primary"
            style={{ background: '#059669', borderColor: '#10b981' }}
            id="confirm-submit-report-btn"
          >
            {isSubmitting ? 'Submitting...' : '✓ Confirm & Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
