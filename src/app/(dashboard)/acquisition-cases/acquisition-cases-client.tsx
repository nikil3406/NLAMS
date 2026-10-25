'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { AcquisitionCaseWithRelations } from '../../../repositories/acquisition-case.repository';
import type { AcquisitionCaseStatus } from '../../../../db/schema/acquisition-cases';

interface AcquisitionCasesClientProps {
  userPermissions: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
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

export function AcquisitionCasesClient({
  userPermissions,
  isSuperAdmin,
}: AcquisitionCasesClientProps) {
  const canCreate = isSuperAdmin || userPermissions.includes('ACQUISITION_CASE_CREATE');

  const [cases, setCases] = useState<AcquisitionCaseWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/acquisition-cases?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view acquisition cases in this scope.');
        }
        throw new Error('Failed to load acquisition cases.');
      }

      const json = await res.json();
      if (json.success) {
        setCases(json.data);
        setTotal(json.pagination.total);
        setTotalPages(json.pagination.totalPages || 1);
      } else {
        throw new Error(json.error || 'Failed to load cases');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchTerm, statusFilter]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCases();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <div className="users-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Acquisition Cases</h1>
          <p className="page-subtitle">
            Manage land acquisition cases linked to infrastructure projects within your administrative scope.
          </p>
        </div>
        {canCreate && (
          <div className="page-actions-group">
            <Link
              href="/acquisition-cases/new"
              className="btn-primary"
              id="create-case-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Acquisition Case</span>
            </Link>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="users-filter-bar">
        <div className="cases-search-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by case reference, title, project name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            id="cases-search-input"
            style={{ height: '38px' }}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchTerm('');
                setPage(1);
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-item">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
            id="cases-status-filter"
            style={{ height: '38px', minWidth: '180px' }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted for Review</option>
            <option value="AWAITING_FIELD_VERIFICATION">Awaiting Field Verification</option>
            <option value="RETURNED_FOR_CORRECTION">Returned for Correction</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <button
          type="submit"
          className="btn-secondary"
          style={{ height: '38px', whiteSpace: 'nowrap' }}
          id="btn-filter-cases"
        >
          Filter
        </button>

        {(searchTerm || statusFilter) && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="btn-cancel"
            style={{ height: '38px', whiteSpace: 'nowrap' }}
            id="btn-reset-cases"
          >
            Reset
          </button>
        )}
      </form>

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert-banner-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Cases Table Container */}
      <div className="users-table-container">
        {isLoading ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading acquisition cases in authorized administrative scope...</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="empty-state-card" id="cases-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>No acquisition cases found</p>
            <p style={{ fontSize: '0.8125rem', maxWidth: '420px', lineHeight: 1.5 }}>
              No cases match the selected filter criteria or administrative scope.
            </p>
            {canCreate && (
              <Link href="/acquisition-cases/new" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create First Acquisition Case
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="users-table-scroll">
              <table className="users-table cases-table">
                <colgroup>
                  <col className="col-case-ref" />
                  <col className="col-case-title" />
                  <col className="col-case-project" />
                  <col className="col-case-unit" />
                  <col className="col-case-status" />
                  <col className="col-case-created" />
                  <col className="col-case-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Case Reference</th>
                    <th>Title &amp; Description</th>
                    <th>Linked Project</th>
                    <th>Administrative Unit</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => {
                    const badge = STATUS_BADGE_STYLES[c.status as AcquisitionCaseStatus] ?? {
                      bg: 'rgba(100,116,139,0.12)',
                      color: '#94a3b8',
                      border: 'rgba(100,116,139,0.3)',
                      label: c.status,
                    };

                    return (
                      <tr key={c.id} id={`case-row-${c.id}`}>
                        <td>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                              color: 'var(--accent-secondary, #60a5fa)',
                              whiteSpace: 'nowrap',
                              fontSize: '0.8125rem',
                            }}
                          >
                            {c.caseReference}
                          </span>
                        </td>
                        <td>
                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: '#fff',
                                display: 'block',
                                wordBreak: 'break-word',
                                lineHeight: 1.35,
                              }}
                            >
                              {c.title}
                            </span>
                            {c.description && (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-muted)',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  marginTop: '0.25rem',
                                  lineHeight: 1.35,
                                }}
                              >
                                {c.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                display: 'block',
                                wordBreak: 'break-word',
                                lineHeight: 1.35,
                              }}
                            >
                              {c.project.name}
                            </span>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono, monospace)',
                                whiteSpace: 'nowrap',
                                display: 'block',
                                marginTop: '0.125rem',
                              }}
                            >
                              {c.project.projectCode}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--text-secondary)',
                              display: 'block',
                              wordBreak: 'break-word',
                              lineHeight: 1.35,
                            }}
                          >
                            {c.project.administrativeUnit?.name}{' '}
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              ({c.project.administrativeUnit?.code})
                            </span>
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '9999px',
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              backgroundColor: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                            <span
                              style={{
                                display: 'block',
                                color: 'var(--text-muted)',
                                fontSize: '0.6875rem',
                                marginTop: '0.125rem',
                              }}
                            >
                              by {c.creator.name}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Link
                            href={`/acquisition-cases/${c.id}`}
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                            id={`view-case-${c.id}`}
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="table-pagination-footer">
              <span className="pagination-info">
                Showing {cases.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
                {Math.min(page * limit, total)} of {total} case{total !== 1 ? 's' : ''}
              </span>
              <div className="pagination-btn-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="pagination-btn"
                  id="cases-prev-page"
                >
                  ← Previous
                </button>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    padding: '0 0.5rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="pagination-btn"
                  id="cases-next-page"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
