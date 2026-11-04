'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { FieldVerificationReportWithDetails } from '../../../repositories/field-verification-report.repository';
import { FieldVerificationReviewModal } from '../acquisition-cases/[id]/field-verification-review-modal';

interface VerificationReviewsClientProps {
  userPermissions: string[];
  userRoles: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

export function VerificationReviewsClient({
  userPermissions,
  userRoles,
  isSuperAdmin,
  currentUserId,
}: VerificationReviewsClientProps) {
  const isLandOfficer = isSuperAdmin || userRoles.includes('LAND_OFFICER');

  const [reports, setReports] = useState<FieldVerificationReportWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('SUBMITTED');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Review Modal state
  const [selectedReport, setSelectedReport] =
    useState<FieldVerificationReportWithDetails | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
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
          throw new Error('You do not have permission to access the field verification review queue.');
        }
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load review queue');
      }

      const json = await res.json();
      setReports(json.data || []);
      setTotal(json.pagination?.total ?? 0);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred loading the review queue'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, reviewStatusFilter, outcomeFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDecisionRecorded = (updated: FieldVerificationReportWithDetails) => {
    setSelectedReport(null);
    setSuccessMessage(`Review decision for report on parcel ${updated.parcel.parcelId} recorded successfully.`);
    fetchQueue();
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
    <div className="users-page-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="users-page-title" style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }} id="review-queue-title">
          Field Verification Review Queue
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
          Authorized Land Officer interface for inspecting submitted field verification reports, auditing evidence, and recording formal workflow decisions.
        </p>
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
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          id="queue-success-banner"
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

      {errorMessage && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
          }}
          id="queue-error-banner"
        >
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
        id="queue-filter-toolbar"
      >
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
              Filter by Review Status
            </label>
            <select
              value={reviewStatusFilter}
              onChange={(e) => {
                setReviewStatusFilter(e.target.value);
                setPage(1);
              }}
              className="form-input"
              style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
              id="filter-review-status-select"
            >
              <option value="SUBMITTED">Awaiting Review (Submitted)</option>
              <option value="ACCEPTED">Accepted Reports</option>
              <option value="RETURNED_FOR_CORRECTION">Returned for Correction</option>
              <option value="DISCREPANCY_FLAGGED">Discrepancy Flagged</option>
              <option value="ALL">All Reports (Excluding Drafts)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
              Filter by Inspection Outcome
            </label>
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setPage(1);
              }}
              className="form-input"
              style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
              id="filter-outcome-select"
            >
              <option value="ALL">All Outcomes</option>
              <option value="VERIFIED">Verified</option>
              <option value="DISCREPANCY_FOUND">Discrepancy Found</option>
              <option value="INCONCLUSIVE">Inconclusive</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
          Showing <strong style={{ color: '#fff' }}>{reports.length}</strong> of <strong style={{ color: '#fff' }}>{total}</strong> report(s)
        </div>
      </div>

      {/* Reports Table */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }} id="queue-loading-state">
            <span className="spinner-sm" style={{ marginRight: '0.5rem' }} />
            Loading review queue...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#94a3b8' }} id="queue-empty-state">
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9375rem' }}>
              No field verification reports matching the selected filters.
            </p>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Drafts are not treated as submitted reports awaiting review.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(0,0,0,0.2)' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Acquisition Case & Project</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Parcel Identity</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Field Officer & Inspection</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Outcome & Submission</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Review Status</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((rpt) => {
                  const sBadge = statusBadges[rpt.status] ?? statusBadges.SUBMITTED;
                  const oStyle = outcomeColors[rpt.outcome ?? ''] ?? {
                    bg: 'rgba(148, 163, 184, 0.1)',
                    color: '#cbd5e1',
                    border: 'rgba(148, 163, 184, 0.2)',
                  };

                  return (
                    <tr
                      key={rpt.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.15s ease',
                      }}
                      id={`queue-row-${rpt.id}`}
                    >
                      {/* Case & Project */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                        <Link
                          href={`/acquisition-cases/${rpt.case.id}`}
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: '#60a5fa',
                            textDecoration: 'none',
                            display: 'block',
                          }}
                        >
                          {rpt.case.caseReference}
                        </Link>
                        <span style={{ color: '#cbd5e1', fontSize: '0.75rem', display: 'block' }}>
                          {rpt.case.title}
                        </span>
                        {rpt.project && (
                          <span style={{ color: '#64748b', fontSize: '0.6875rem', display: 'block' }}>
                            Project: {rpt.project.name}
                          </span>
                        )}
                      </td>

                      {/* Parcel Identity */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                        <strong style={{ color: '#fff' }}>{rpt.parcel.parcelId}</strong>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>
                          Survey #{rpt.parcel.surveyNumber}
                          {rpt.parcel.subdivisionNumber ? ` / ${rpt.parcel.subdivisionNumber}` : ''}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.6875rem', display: 'block' }}>
                          {rpt.parcel.village}, {rpt.parcel.district}
                        </span>
                      </td>

                      {/* Field Officer & Inspection */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                        <span style={{ color: '#fff', fontWeight: 500, display: 'block' }}>
                          {rpt.creator.name}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>
                          {rpt.verificationDate ? new Date(rpt.verificationDate).toLocaleDateString() : 'Date pending'}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                          Revision {rpt.revisionNumber ?? 1}
                        </span>
                      </td>

                      {/* Outcome & Submission */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                        {rpt.outcome && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: oStyle.bg,
                              color: oStyle.color,
                              border: `1px solid ${oStyle.border}`,
                              display: 'inline-block',
                              marginBottom: '0.25rem',
                            }}
                          >
                            {rpt.outcome}
                          </span>
                        )}
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>
                          Submitted: {rpt.submittedAt ? new Date(rpt.submittedAt).toLocaleDateString() : 'Pending'}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                          📎 {rpt.evidence?.length ?? 0} evidence item(s)
                        </span>
                      </td>

                      {/* Review Status */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top' }}>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontWeight: 600,
                            backgroundColor: sBadge.bg,
                            color: sBadge.color,
                            border: `1px solid ${sBadge.border}`,
                            display: 'inline-block',
                          }}
                        >
                          {sBadge.label}
                        </span>
                        {rpt.reviewedAt && (
                          <span style={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', marginTop: '0.2rem' }}>
                            {new Date(rpt.reviewedAt).toLocaleDateString()}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'top', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedReport(rpt)}
                          className="btn-primary"
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.35rem 0.75rem',
                            backgroundColor: rpt.status === 'SUBMITTED' ? '#059669' : undefined,
                            borderColor: rpt.status === 'SUBMITTED' ? '#10b981' : undefined,
                          }}
                          id={`review-report-btn-${rpt.id}`}
                        >
                          {rpt.status === 'SUBMITTED' && isLandOfficer ? 'Review Report' : 'Inspect Report'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > limit && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8125rem',
            }}
          >
            <span style={{ color: '#94a3b8' }}>
              Page {page} of {totalPages}
            </span>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                id="pagination-prev-btn"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                id="pagination-next-btn"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedReport && (
        <FieldVerificationReviewModal
          report={selectedReport}
          caseId={selectedReport.case.id}
          caseParcelId={selectedReport.caseParcel.id}
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

