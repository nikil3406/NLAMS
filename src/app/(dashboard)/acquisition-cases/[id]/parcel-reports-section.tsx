'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import type { FieldVerificationReportWithDetails } from '../../../../repositories/field-verification-report.repository';

interface ParcelReportsSectionProps {
  caseId: string;
  caseParcel: CaseParcelWithDetails;
  caseStatus: string;
  currentUserId: string;
  userRoles: string[];
  onOpenReportModal: (reportId?: string | null, report?: FieldVerificationReportWithDetails | null) => void;
  onReportsCountChange?: (count: number) => void;
  refreshTrigger?: number;
}

export function ParcelReportsSection({
  caseId,
  caseParcel,
  caseStatus,
  currentUserId,
  userRoles,
  onOpenReportModal,
  onReportsCountChange,
  refreshTrigger = 0,
}: ParcelReportsSectionProps) {
  const isFieldOfficer = userRoles.includes('FIELD_OFFICER');
  const isAwaitingVerification = caseStatus === 'AWAITING_FIELD_VERIFICATION';
  const canCreateReport = isFieldOfficer && isAwaitingVerification;

  const [reports, setReports] = useState<FieldVerificationReportWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports?page=1&limit=50`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load field verification reports');
      }
      const json = await res.json();
      const list: FieldVerificationReportWithDetails[] = json.data || [];
      setReports(list);
      if (onReportsCountChange) {
        onReportsCountChange(list.length);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error loading verification reports'
      );
    } finally {
      setIsLoading(false);
    }
  }, [caseId, caseParcel.id, onReportsCountChange]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports, refreshTrigger]);

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

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: '8px',
        padding: '1.25rem',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
      id="parcel-reports-section"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <h4
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#38bdf8',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            E. Field Verification Reports
          </h4>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontWeight: 600,
            }}
            id="reports-count-badge"
          >
            {reports.length}
          </span>
        </div>

        {canCreateReport && (
          <button
            type="button"
            onClick={() => onOpenReportModal(null, null)}
            className="btn-primary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            id="create-field-report-btn"
          >
            + New Inspection Report
          </button>
        )}
      </div>

      {/* State: Loading */}
      {isLoading && (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '0.8125rem',
          }}
          id="reports-loading-box"
        >
          <span className="spinner-sm" style={{ marginRight: '0.5rem' }} />
          Loading verification reports for parcel {caseParcel.parcel.parcelId}...
        </div>
      )}

      {/* State: Error */}
      {errorMessage && !isLoading && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#fca5a5',
            fontSize: '0.8125rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          id="reports-error-box"
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={fetchReports}
            className="btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* State: Empty */}
      {!isLoading && !errorMessage && reports.length === 0 && (
        <div
          style={{
            padding: '2rem 1rem',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            textAlign: 'center',
          }}
          id="reports-empty-box"
        >
          <p style={{ margin: '0 0 0.75rem 0', color: '#94a3b8', fontSize: '0.8125rem' }}>
            No field verification reports recorded for this parcel yet.
          </p>
          {canCreateReport ? (
            <button
              type="button"
              onClick={() => onOpenReportModal(null, null)}
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
              id="empty-create-report-btn"
            >
              + Record Initial Field Inspection
            </button>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Field reports can be conducted once ground verification is authorized.
            </span>
          )}
        </div>
      )}

      {/* State: Reports List */}
      {!isLoading && !errorMessage && reports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} id="reports-list">
          {reports.map((rpt) => {
            const isSub = rpt.status === 'SUBMITTED';
            const isAuthor = rpt.createdBy === currentUserId;
            const outcomeStyle = outcomeColors[rpt.outcome ?? ''] || {
              bg: 'rgba(148, 163, 184, 0.12)',
              color: '#cbd5e1',
              border: 'rgba(148, 163, 184, 0.25)',
            };

            return (
              <div
                key={rpt.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  transition: 'border-color 0.15s ease',
                }}
                id={`report-card-${rpt.id}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          color: '#60a5fa',
                          fontWeight: 600,
                        }}
                      >
                        {rpt.id.slice(0, 8)}...
                      </span>

                      {/* Status Badge */}
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          background: isSub ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: isSub ? '#34d399' : '#60a5fa',
                          border: `1px solid ${isSub ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                        }}
                      >
                        {isSub ? '🔒 SUBMITTED' : '✎ DRAFT'}
                      </span>

                      {/* Outcome Badge */}
                      {rpt.outcome && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: outcomeStyle.bg,
                            color: outcomeStyle.color,
                            border: `1px solid ${outcomeStyle.border}`,
                          }}
                        >
                          {rpt.outcome}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      <span>Inspection: </span>
                      <strong style={{ color: '#f1f5f9' }}>
                        {rpt.verificationDate
                          ? new Date(rpt.verificationDate).toLocaleDateString()
                          : 'Date pending'}
                      </strong>
                      <span style={{ margin: '0 0.4rem' }}>•</span>
                      <span>Officer: </span>
                      <strong style={{ color: '#f1f5f9' }}>
                        {isSub ? rpt.verifier?.name || 'Field Officer' : `${rpt.creator.name} (Author)`}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenReportModal(rpt.id, rpt)}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                    id={`inspect-report-${rpt.id}-btn`}
                  >
                    {!isSub && isAuthor && canCreateReport ? 'Edit Draft' : 'Inspect Details'}
                  </button>
                </div>

                {/* Observations excerpt */}
                {rpt.observations && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.75rem',
                      color: '#cbd5e1',
                      lineHeight: '1.4',
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '4px',
                    }}
                  >
                    {rpt.observations.length > 140
                      ? `${rpt.observations.slice(0, 140)}...`
                      : rpt.observations}
                  </p>
                )}

                {/* Metadata row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.6875rem',
                    color: '#64748b',
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    paddingTop: '0.5rem',
                  }}
                >
                  <div>
                    {rpt.measuredArea ? (
                      <span>
                        Field-Measured: <strong style={{ color: '#38bdf8' }}>{rpt.measuredArea} {rpt.measuredAreaUnit}</strong>
                      </span>
                    ) : (
                      <span>No measurement entered</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span>📎 {rpt.evidence?.length ?? 0} evidence item(s)</span>
                    {rpt.submittedAt && (
                      <span>Submitted: {new Date(rpt.submittedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
