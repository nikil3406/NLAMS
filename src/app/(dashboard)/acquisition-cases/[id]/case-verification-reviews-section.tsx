'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { FieldVerificationReportWithDetails, CaseVerificationSummary } from '../../../../repositories/field-verification-report.repository';
import { FieldVerificationReviewModal } from './field-verification-review-modal';

interface CaseVerificationReviewsSectionProps {
  caseId: string;
  caseStatus: string;
  currentUserId: string;
  userRoles: string[];
  isSuperAdmin: boolean;
  isVerifiedLandOfficer: boolean;
  verificationSummary?: CaseVerificationSummary | null;
  onReviewDecisionRecorded?: () => void;
}

export function CaseVerificationReviewsSection({
  caseId,
  caseStatus,
  currentUserId,
  userRoles,
  isSuperAdmin,
  isVerifiedLandOfficer,
  verificationSummary,
  onReviewDecisionRecorded,
}: CaseVerificationReviewsSectionProps) {
  const isLandOfficer = isSuperAdmin || userRoles.includes('LAND_OFFICER');

  const [reports, setReports] = useState<FieldVerificationReportWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('SUBMITTED');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review modal state
  const [selectedReport, setSelectedReport] =
    useState<FieldVerificationReportWithDetails | null>(null);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        caseId,
        page: String(page),
        limit: String(limit),
      });

      if (reviewStatusFilter && reviewStatusFilter !== 'ALL') {
        params.set('reviewStatus', reviewStatusFilter);
      }
      if (outcomeFilter && outcomeFilter !== 'ALL') {
        params.set('outcome', outcomeFilter);
      }

      const res = await fetch(`/api/field-verification-reviews?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access restricted: Only verified Land Officers within administrative scope may access verification review.');
        }
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load field verification reports');
      }

      const json = await res.json();
      setReports(json.data || []);
      setTotal(json.pagination?.total ?? 0);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred loading verification reports'
      );
    } finally {
      setIsLoading(false);
    }
  }, [caseId, page, limit, reviewStatusFilter, outcomeFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDecisionRecorded = (updated: FieldVerificationReportWithDetails) => {
    setSelectedReport(null);
    setSuccessMessage(`Review decision for parcel ${updated.parcel.parcelId} recorded successfully.`);
    fetchReports();
    if (onReviewDecisionRecorded) {
      onReviewDecisionRecorded();
    }
  };

  const statusBadges: Record<string, { bg: string; color: string; border: string; label: string }> = {
    SUBMITTED: {
      bg: 'rgba(59, 130, 246, 0.12)',
      color: '#60a5fa',
      border: 'rgba(59, 130, 246, 0.3)',
      label: 'Awaiting Review',
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

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} id="case-verification-reviews-section">
      {/* Header Banner */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                Field Verification Reports & Review
              </h2>
              {verificationSummary && (
                <span
                  style={{
                    background: verificationSummary.reportsAwaitingReview > 0
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                    border: `1px solid ${
                      verificationSummary.reportsAwaitingReview > 0
                        ? 'rgba(59, 130, 246, 0.3)'
                        : 'rgba(16, 185, 129, 0.3)'
                    }`,
                    color: verificationSummary.reportsAwaitingReview > 0 ? '#60a5fa' : '#34d399',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                  id="case-reviews-awaiting-badge"
                >
                  {verificationSummary.reportsAwaitingReview} Awaiting Review
                </span>
              )}
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#94a3b8' }}>
              Unified Land Officer interface for inspecting submitted parcel reports, auditing evidence, and recording formal workflow decisions.
            </p>
          </div>

          {!isVerifiedLandOfficer && (
            <div
              style={{
                fontSize: '0.75rem',
                color: '#fbbf24',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
              }}
              id="unverified-lo-notice"
            >
              🔒 Review actions restricted to active, verified Land Officers
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
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
          id="reviews-success-banner"
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
          id="reviews-error-banner"
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={fetchReports}
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

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {[
            { id: 'SUBMITTED', label: 'Awaiting Review' },
            { id: 'ALL', label: 'All Reports' },
            { id: 'ACCEPTED', label: 'Accepted' },
            { id: 'RETURNED_FOR_CORRECTION', label: 'Returned' },
            { id: 'DISCREPANCY_FLAGGED', label: 'Discrepancy Flagged' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setReviewStatusFilter(tab.id);
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: reviewStatusFilter === tab.id
                  ? '1px solid #3b82f6'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: reviewStatusFilter === tab.id
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(255, 255, 255, 0.02)',
                color: reviewStatusFilter === tab.id ? '#60a5fa' : '#94a3b8',
                cursor: 'pointer',
              }}
              id={`filter-status-${tab.id.toLowerCase()}-btn`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Outcome Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Outcome:</span>
          <select
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
            className="users-search-input"
            style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.5rem', width: 'auto' }}
            id="review-outcome-filter-select"
          >
            <option value="ALL">All Outcomes</option>
            <option value="VERIFIED">Verified</option>
            <option value="DISCREPANCY_FOUND">Discrepancy Found</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
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
          id="reviews-loading-card"
        >
          <span className="spinner-sm" style={{ marginRight: '0.5rem' }} />
          Loading reports for review...
        </div>
      ) : reports.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '3rem 2rem',
            textAlign: 'center',
          }}
          id="reviews-empty-card"
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
            ✓
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 0.5rem 0' }}>
            {reviewStatusFilter === 'SUBMITTED'
              ? 'No Reports Awaiting Review'
              : 'No Reports Found Matching Filter'}
          </h3>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', maxWidth: '440px', margin: '0 auto' }}>
            {reviewStatusFilter === 'SUBMITTED'
              ? 'All submitted field verification reports for this acquisition case have been audited and reviewed.'
              : 'No reports match the selected review status or outcome filter.'}
          </p>
        </div>
      ) : (
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
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Parcel / Survey #</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Field Officer / Inspection</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Rev #</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Outcome</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Review Status</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Field Measured</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((rpt, idx) => {
                  const statusInfo = statusBadges[rpt.status] || {
                    bg: 'rgba(148, 163, 184, 0.12)',
                    color: '#cbd5e1',
                    border: 'rgba(148, 163, 184, 0.25)',
                    label: rpt.status,
                  };
                  const outcomeStyle = outcomeColors[rpt.outcome ?? ''] || {
                    bg: 'rgba(148, 163, 184, 0.12)',
                    color: '#cbd5e1',
                    border: 'rgba(148, 163, 184, 0.25)',
                  };
                  const isAuthor =
                    rpt.createdBy === currentUserId ||
                    (rpt.verifiedBy !== null && rpt.verifiedBy === currentUserId);
                  const canAct =
                    isLandOfficer &&
                    isVerifiedLandOfficer &&
                    !isAuthor &&
                    rpt.status === 'SUBMITTED';

                  return (
                    <tr
                      key={rpt.id}
                      style={{
                        borderBottom: idx !== reports.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                      }}
                      id={`review-row-${rpt.id}`}
                    >
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600 }}>
                            {rpt.parcel.parcelId}
                          </span>
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>
                          Survey #{rpt.parcel.surveyNumber} • {rpt.parcel.village}
                        </div>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 500 }}>
                          {rpt.verifier?.name || rpt.creator.name}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                          {rpt.verificationDate
                            ? new Date(rpt.verificationDate).toLocaleDateString()
                            : 'Date pending'}
                        </div>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                          }}
                        >
                          Rev {rpt.revisionNumber ?? 1}
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        {rpt.outcome && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              background: outcomeStyle.bg,
                              color: outcomeStyle.color,
                              border: `1px solid ${outcomeStyle.border}`,
                            }}
                          >
                            {rpt.outcome}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            border: `1px solid ${statusInfo.border}`,
                          }}
                          id={`review-status-badge-${rpt.id}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        {rpt.measuredArea ? (
                          <div>
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                              {Number(rpt.measuredArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                              {rpt.measuredAreaUnit}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                        {isAuthor && rpt.status === 'SUBMITTED' ? (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              color: '#94a3b8',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                            }}
                            title="Report authors cannot review their own reports (Separation of duties)"
                          >
                            Author (Separation of Duties)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedReport(rpt)}
                            className={canAct ? 'btn-primary' : 'btn-secondary'}
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                            id={`inspect-review-${rpt.id}-btn`}
                          >
                            {canAct ? 'Inspect & Review' : 'View Report'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: '#94a3b8',
              }}
            >
              <span>Showing {reports.length} of {total} report(s)</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  Previous
                </button>
                <span style={{ alignSelf: 'center', color: '#f1f5f9' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {selectedReport && (
        <FieldVerificationReviewModal
          report={selectedReport}
          caseId={caseId}
          caseParcelId={selectedReport.caseParcelId}
          currentUserId={currentUserId}
          userRoles={userRoles}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedReport(null)}
          onDecisionSuccess={handleDecisionRecorded}
        />
      )}
    </div>
  );
}

