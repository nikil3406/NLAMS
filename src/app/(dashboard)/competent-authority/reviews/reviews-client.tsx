'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ReviewProposalItem {
  id: string;
  proposalNumber: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  acquisitionCaseId: string;
  acquisitionCaseReference: string;
  acquisitionCaseTitle: string;
  implementingAgencyId: string;
  implementingAgencyName: string;
  implementingAgencyCode: string;
  currentVersionId: string | null;
  versionNumber: number;
  submissionDate: string | null;
  submittedBy: { id: string; name: string; email: string } | null;
  authorityId: string;
  authorityCode: string;
  authorityName: string;
  authorityDesignation: string;
  authorityLevel: string;
  status: string;
  createdAt: string;
}

interface UserAuthority {
  id: string;
  authorityCode: string;
  authorityName: string;
  designation: string;
  authorityLevel: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  SUBMITTED: {
    bg: 'rgba(59, 130, 246, 0.12)',
    color: '#60a5fa',
    border: 'rgba(59, 130, 246, 0.3)',
    label: 'Submitted',
  },
  UNDER_REVIEW: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'Under Review',
  },
  CORRECTION_REQUESTED: {
    bg: 'rgba(234, 88, 12, 0.12)',
    color: '#fb923c',
    border: 'rgba(234, 88, 12, 0.3)',
    label: 'Correction Requested',
  },
  APPROVED: {
    bg: 'rgba(16, 185, 129, 0.18)',
    color: '#10b981',
    border: 'rgba(16, 185, 129, 0.4)',
    label: 'Approved',
  },
  REJECTED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
  DRAFT: {
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.3)',
    label: 'Draft',
  },
};

export function ReviewsClient({ currentUserId }: { currentUserId: string }) {
  const [items, setItems] = useState<ReviewProposalItem[]>([]);
  const [userAuthorities, setUserAuthorities] = useState<UserAuthority[]>([]);
  const [selectedAuthorityId, setSelectedAuthorityId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [submittedFrom, setSubmittedFrom] = useState<string>('');
  const [submittedTo, setSubmittedTo] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedAuthorityId) params.set('authorityId', selectedAuthorityId);
      if (statusFilter) params.set('status', statusFilter);
      if (searchFilter.trim()) params.set('search', searchFilter.trim());
      if (submittedFrom) params.set('submittedFrom', submittedFrom);
      if (submittedTo) params.set('submittedTo', submittedTo);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/competent-authorities/reviews?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load review proposals');
      }

      setItems(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      if (json.userAuthorities) {
        setUserAuthorities(json.userAuthorities);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading proposals');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAuthorityId, statusFilter, searchFilter, submittedFrom, submittedTo, page, limit]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleResetFilters = () => {
    setSelectedAuthorityId('');
    setStatusFilter('');
    setSearchFilter('');
    setSubmittedFrom('');
    setSubmittedTo('');
    setPage(1);
  };

  const pendingCount = items.filter((i) => i.status === 'SUBMITTED').length;
  const underReviewCount = items.filter((i) => i.status === 'UNDER_REVIEW').length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚖</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Competent Authority Review Dashboard
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            Scrutinize and evaluate land acquisition proposals submitted to your designated authority.
          </p>
        </div>

        {/* Authority Context Selector (if assigned to multiple authorities) */}
        {userAuthorities.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="authority-context-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Authority Context:
            </label>
            <select
              id="authority-context-select"
              value={selectedAuthorityId}
              onChange={(e) => {
                setSelectedAuthorityId(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              <option value="">All Assigned Authorities ({userAuthorities.length})</option>
              {userAuthorities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.authorityName} ({a.authorityCode} - {a.authorityLevel})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Proposals Assigned
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {pagination.total}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ color: '#60a5fa', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Pending Scrutiny (Submitted)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#60a5fa', marginTop: '0.25rem' }}>
            {pendingCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ color: '#fbbf24', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Under Review
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>
            {underReviewCount}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 200px' }}>
          <input
            type="text"
            placeholder="Search proposals, cases, projects, agencies..."
            value={searchFilter}
            onChange={(e) => {
              setSearchFilter(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
              fontSize: '0.8125rem',
            }}
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
              fontSize: '0.8125rem',
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CORRECTION_REQUESTED">Correction Requested</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From:</label>
          <input
            type="date"
            value={submittedFrom}
            onChange={(e) => {
              setSubmittedFrom(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To:</label>
          <input
            type="date"
            value={submittedTo}
            onChange={(e) => {
              setSubmittedTo(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
            }}
          />
        </div>

        {(statusFilter || searchFilter || submittedFrom || submittedTo || selectedAuthorityId) && (
          <button
            onClick={handleResetFilters}
            className="btn btn-secondary"
            style={{
              padding: '0.45rem 0.75rem',
              fontSize: '0.75rem',
              borderRadius: '0.375rem',
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
            color: '#f87171',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Proposals Table */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Proposal Reference</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Project Name</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Acquisition Case</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Implementing Agency</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>Version</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Submission Date</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Authority</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading review queue...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No acquisition proposals found in the review queue matching the selected criteria.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const badge = STATUS_BADGE_STYLES[row.status] || STATUS_BADGE_STYLES.DRAFT;
                  const formattedDate = row.submissionDate
                    ? new Date(row.submissionDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Proposal Reference */}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        <Link
                          href={`/acquisition-proposals/${row.id}`}
                          style={{ color: '#f59e0b', textDecoration: 'none' }}
                        >
                          {row.proposalNumber}
                        </Link>
                      </td>

                      {/* Project Name */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>
                        <div style={{ fontWeight: 500 }}>{row.projectName}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{row.projectCode}</div>
                      </td>

                      {/* Acquisition Case */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>
                        <div style={{ fontWeight: 500 }}>{row.acquisitionCaseTitle}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{row.acquisitionCaseReference}</div>
                      </td>

                      {/* Implementing Agency */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>
                        <div>{row.implementingAgencyName}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{row.implementingAgencyCode}</div>
                      </td>

                      {/* Proposal Version */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '0.25rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          v{row.versionNumber}
                        </span>
                      </td>

                      {/* Submission Date */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <div>{formattedDate}</div>
                        {row.submittedBy && (
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            by {row.submittedBy.name}
                          </div>
                        )}
                      </td>

                      {/* Authority */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.authorityName}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {row.authorityDesignation} ({row.authorityLevel})
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.25rem',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.025em',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          href={`/acquisition-proposals/${row.id}`}
                          className="btn btn-secondary"
                          style={{
                            padding: '0.35rem 0.7rem',
                            fontSize: '0.75rem',
                            borderRadius: '0.375rem',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontWeight: 600,
                          }}
                        >
                          View Proposal →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              Showing {items.length} of {pagination.total} proposal(s)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-secondary"
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  opacity: page <= 1 ? 0.5 : 1,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span style={{ alignSelf: 'center', fontWeight: 600 }}>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="btn btn-secondary"
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  opacity: page >= pagination.totalPages ? 0.5 : 1,
                  cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

