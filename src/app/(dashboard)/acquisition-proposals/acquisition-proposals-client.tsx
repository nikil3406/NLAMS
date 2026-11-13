'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ProposalListItem } from '../../../repositories/acquisition-proposal.repository';
import type { ProposalStatus } from '../../../../db/schema/acquisition-proposals';

interface AcquisitionProposalsClientProps {
  userPermissions: string[];
  userRoles: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

const STATUS_BADGE_STYLES: Record<
  ProposalStatus | string,
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
    label: 'Submitted',
  },
  UNDER_REVIEW: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'Under Review',
  },
  APPROVED: {
    bg: 'rgba(16, 185, 129, 0.18)',
    color: '#10b981',
    border: 'rgba(16, 185, 129, 0.4)',
    label: '✓ Approved',
  },
  REJECTED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
};

export function AcquisitionProposalsClient({
  userRoles,
  currentUserId,
}: AcquisitionProposalsClientProps) {
  const isAgencyUser =
    userRoles.includes('IMPLEMENTING_AGENCY') ||
    userRoles.includes('PROJECT_OFFICER');

  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/acquisition-proposals?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view proposals in this scope.');
        }
        throw new Error('Failed to load acquisition proposals.');
      }

      const json = await res.json();
      if (json.success) {
        setProposals(json.data);
        setTotal(json.pagination.total);
        setTotalPages(json.pagination.totalPages);
      } else {
        throw new Error(json.error || 'Failed to load proposals.');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while loading proposals.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchTerm, statusFilter]);

  // Check eligible cases count for authorized Implementing Agency users
  useEffect(() => {
    if (!isAgencyUser) return;
    async function checkEligibleCases() {
      try {
        const res = await fetch('/api/acquisition-proposals/eligible-cases');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setEligibleCount(json.data.length);
          }
        }
      } catch {
        // Non-critical metric
      }
    }
    checkEligibleCases();
  }, [isAgencyUser]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProposals();
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Acquisition Proposals
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontWeight: 600,
              }}
            >
              Step 1: Preparation
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '0.375rem 0 0 0', fontSize: '0.875rem' }}>
            Prepare and save land acquisition proposals for eligible cases with Ministry-approved Verified Land Inventories.
          </p>
        </div>

        {/* Action Button: Only visible to authorized Implementing Agency users */}
        {isAgencyUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {eligibleCount !== null && (
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: eligibleCount > 0 ? '#34d399' : 'var(--text-muted)',
                  fontWeight: 500,
                }}
              >
                {eligibleCount} eligible case{eligibleCount === 1 ? '' : 's'} available
              </span>
            )}
            <Link
              href="/acquisition-proposals/new"
              id="create-proposal-btn"
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Proposal
            </Link>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '0.5rem',
          border: '1px solid var(--border-color)',
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{ flex: '1 1 300px', display: 'flex', gap: '0.5rem' }}
        >
          <input
            type="text"
            className="form-control"
            placeholder="Search by proposal #, case reference, or project name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            style={{
              padding: '0.45rem 0.875rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Status:</label>
          <select
            className="form-select"
            value={statusFilter}
            onChange={handleStatusChange}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
            }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setSearchTerm('');
            setStatusFilter('');
            setPage(1);
          }}
          className="btn btn-outline"
          style={{
            padding: '0.45rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          Reset
        </button>
      </div>

      {/* Error state */}
      {errorMessage && (
        <div
          style={{
            padding: '0.875rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.375rem',
            color: '#f87171',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Table Card */}
      <div
        className="card"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '0.5rem',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            className="table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Proposal Number
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Project
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Acquisition Case
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Current Version
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Created Date
                </th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading acquisition proposals...
                  </td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      No acquisition proposals found.
                    </div>
                    {isAgencyUser && (
                      <Link
                        href="/acquisition-proposals/new"
                        className="btn btn-secondary"
                        style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.8125rem' }}
                      >
                        Create Proposal for an Eligible Case
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                proposals.map((p) => {
                  const badge =
                    STATUS_BADGE_STYLES[p.currentStatus] ||
                    STATUS_BADGE_STYLES.DRAFT;
                  const isCreator = p.createdBy === currentUserId;
                  const isDraft = p.currentStatus === 'DRAFT';

                  return (
                    <tr
                      key={p.id}
                      id={`proposal-row-${p.id}`}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 600,
                            color: 'var(--accent-secondary, #60a5fa)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {p.proposalNumber}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.project.name}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono, monospace)',
                            marginTop: '0.125rem',
                          }}
                        >
                          {p.project.projectCode}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {p.acquisitionCase.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono, monospace)',
                            marginTop: '0.125rem',
                          }}
                        >
                          {p.acquisitionCase.caseReference}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '0.8125rem',
                            padding: '0.15rem 0.4rem',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '0.25rem',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          v{p.currentVersionNumber}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                          by {p.creator.name}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Link
                            href={`/acquisition-proposals/${p.id}`}
                            className="btn btn-outline"
                            style={{
                              padding: '0.3rem 0.65rem',
                              fontSize: '0.75rem',
                              textDecoration: 'none',
                              borderRadius: '0.25rem',
                            }}
                          >
                            View
                          </Link>
                          {isDraft && isCreator && (
                            <Link
                              href={`/acquisition-proposals/${p.id}/edit`}
                              className="btn btn-secondary"
                              style={{
                                padding: '0.3rem 0.65rem',
                                fontSize: '0.75rem',
                                textDecoration: 'none',
                                borderRadius: '0.25rem',
                              }}
                            >
                              Edit Draft
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border-color)',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              Showing page {page} of {totalPages} ({total} total proposals)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem' }}
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

