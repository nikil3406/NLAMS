'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VerifiedLandInventoryStatus } from '../../../../db/schema/verified-land-inventories';

interface InventoryItem {
  inventory: {
    id: string;
    caseId: string;
    versionNumber: number;
    status: VerifiedLandInventoryStatus;
    totalParcelCount: number;
    aggregateRecordedArea: string;
    aggregateAffectedArea: string;
    areaUnit: string;
    preparedBy: string;
    generatedAt: string;
    submittedBy: string | null;
    submittedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewRemarks: string | null;
    previousVersionId: string | null;
  };
  acquisitionCase: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
    projectId: string;
    project: {
      id: string;
      name: string;
      projectCode: string;
      administrativeUnit?: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  preparer: {
    id: string;
    name: string;
    email: string;
  };
}

interface SummaryMetrics {
  total: number;
  draft: number;
  pendingReview: number;
  approved: number;
  correctionRequested: number;
}

interface EligibleCase {
  id: string;
  caseReference: string;
  title: string;
  status: string;
  totalParcelsCount: number;
  project: {
    id: string;
    name: string;
    projectCode: string;
  };
}

interface VerifiedLandInventoriesClientProps {
  userPermissions: string[];
  userRoles: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

const INVENTORY_STATUS_CONFIG: Record<
  VerifiedLandInventoryStatus,
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
  UNDER_REVIEW: {
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#c084fc',
    border: 'rgba(168, 85, 247, 0.3)',
    label: 'Under Ministry Review',
  },
  CORRECTION_REQUESTED: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
    label: 'Returned for Correction',
  },
  APPROVED: {
    bg: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: 'rgba(16, 185, 129, 0.3)',
    label: 'Approved (Immutable)',
  },
  REJECTED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
};

export function VerifiedLandInventoriesClient({
  userRoles,
}: VerifiedLandInventoriesClientProps) {
  const router = useRouter();

  const isLandOfficer = userRoles.includes('LAND_OFFICER');
  const isMinistryAdmin = userRoles.includes('MINISTRY_ADMIN');

  // If Ministry Admin, default to 'queue' view, else 'all'
  const [viewMode, setViewMode] = useState<'queue' | 'all'>(
    isMinistryAdmin ? 'queue' : 'all'
  );

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    total: 0,
    draft: 0,
    pendingReview: 0,
    approved: 0,
    correctionRequested: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(
    isMinistryAdmin ? 'PENDING_REVIEW' : ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generation Modal State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [eligibleCases, setEligibleCases] = useState<EligibleCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [generateRemarks, setGenerateRemarks] = useState('');
  const [loadingCases, setLoadingCases] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Submit Modal State
  const [submittingInventory, setSubmittingInventory] = useState<InventoryItem | null>(null);
  const [submitRemarks, setSubmitRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadInventories = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/verified-land-inventories/dashboard?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view land inventories in this scope.');
        }
        throw new Error('Failed to load verified land inventories.');
      }

      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        if (json.pagination) {
          setTotal(json.pagination.total);
          setTotalPages(json.pagination.totalPages || 1);
        }
        if (json.summary) {
          setSummary(json.summary);
        }
      } else {
        throw new Error(json.error || 'Failed to load inventories');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred while loading data'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchTerm, statusFilter]);

  useEffect(() => {
    loadInventories();
  }, [loadInventories]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInventories();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter(viewMode === 'queue' ? 'PENDING_REVIEW' : '');
    setPage(1);
  };

  const handleTabChange = (mode: 'queue' | 'all') => {
    setViewMode(mode);
    setSearchTerm('');
    setPage(1);
    if (mode === 'queue') {
      setStatusFilter('PENDING_REVIEW');
    } else {
      setStatusFilter('');
    }
  };

  // Open Generate Modal and fetch eligible cases
  const handleOpenGenerateModal = async () => {
    setShowGenerateModal(true);
    setSelectedCaseId('');
    setGenerateRemarks('');
    setGenerateError(null);
    setLoadingCases(true);

    try {
      const res = await fetch('/api/acquisition-cases?status=FIELD_VERIFICATION_COMPLETED&limit=100');
      if (!res.ok) {
        throw new Error('Failed to fetch eligible acquisition cases.');
      }
      const data = await res.json();
      if (data.success) {
        setEligibleCases(data.data || []);
      } else {
        throw new Error(data.error || 'Failed to load eligible cases.');
      }
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : 'Error fetching eligible cases'
      );
    } finally {
      setLoadingCases(false);
    }
  };

  // Execute Generation
  const handleGenerateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) {
      setGenerateError('Please select an eligible acquisition case.');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch(`/api/acquisition-cases/${selectedCaseId}/inventories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remarks: generateRemarks.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate verified land inventory.');
      }

      setShowGenerateModal(false);
      setSuccessMessage(`Inventory Version ${data.data.versionNumber ?? data.data.version ?? 1} generated successfully!`);
      // Navigate to the newly generated inventory detail view
      router.push(`/verified-land-inventories/${data.data.id}`);
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : 'Error generating inventory'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Execute Submission of Draft Inventory
  const handleSubmitInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingInventory) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/verified-land-inventories/${submittingInventory.inventory.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remarks: submitRemarks.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit verified land inventory.');
      }

      setSubmittingInventory(null);
      setSubmitRemarks('');
      setSuccessMessage(`Inventory v${submittingInventory.inventory.versionNumber} has been submitted for Ministry review.`);
      loadInventories();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Error submitting inventory'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="users-page">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Verified Land Inventory</h1>
          <p className="page-subtitle">
            Versioned, immutable inventories generated from accepted field verifications and resolved discrepancies.
          </p>
        </div>
        {isLandOfficer && (
          <div className="page-actions-group">
            <button
              type="button"
              className="btn-primary"
              id="btn-generate-inventory"
              onClick={handleOpenGenerateModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              <span>Generate Inventory</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="alert-banner-success" style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          fontSize: '0.875rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Ministry Review / All Inventories Tab Switcher */}
      {isMinistryAdmin && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => handleTabChange('queue')}
            className={viewMode === 'queue' ? 'btn-primary' : 'btn-secondary'}
            id="tab-ministry-queue"
          >
            Ministry Review Queue{summary.pendingReview > 0 ? ` (${summary.pendingReview})` : ''}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('all')}
            className={viewMode === 'all' ? 'btn-primary' : 'btn-secondary'}
            id="tab-all-inventories"
          >
            All Inventories
          </button>
        </div>
      )}

      {/* Summary Metrics Cards */}
      <section className="metrics-section" style={{ marginBottom: '1.5rem' }}>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <div className="metric-card" id="metric-total-inventories">
            <div className="metric-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{summary.total}</span>
              <span className="metric-label">Total Inventories</span>
            </div>
          </div>

          <div className="metric-card" id="metric-draft-inventories">
            <div className="metric-icon-box" style={{ color: '#94a3b8' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{summary.draft}</span>
              <span className="metric-label">Draft Inventories</span>
            </div>
          </div>

          <div className="metric-card" id="metric-pending-review">
            <div className="metric-icon-box" style={{ color: '#60a5fa' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{summary.pendingReview}</span>
              <span className="metric-label">Pending Ministry Review</span>
            </div>
          </div>

          <div className="metric-card" id="metric-approved-inventories">
            <div className="metric-icon-box status-active">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{summary.approved}</span>
              <span className="metric-label">Approved Inventories</span>
            </div>
          </div>

          <div className="metric-card" id="metric-returned-correction">
            <div className="metric-icon-box" style={{ color: '#fbbf24' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{summary.correctionRequested}</span>
              <span className="metric-label">Returned for Correction</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="users-filter-bar" style={{ marginBottom: '1.25rem' }}>
        <div className="cases-search-wrapper" style={{ flex: 1 }}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by case reference, title, or project name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            id="inventories-search-input"
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
            id="inventories-status-filter"
            style={{ height: '38px', minWidth: '190px' }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted for Review</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CORRECTION_REQUESTED">Returned for Correction</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <button
          type="submit"
          className="btn-secondary"
          style={{ height: '38px', whiteSpace: 'nowrap' }}
          id="btn-filter-inventories"
        >
          Filter
        </button>

        {(searchTerm || statusFilter) && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="btn-cancel"
            style={{ height: '38px', whiteSpace: 'nowrap' }}
            id="btn-reset-inventories"
          >
            Reset
          </button>
        )}
      </form>

      {/* Error Alert */}
      {errorMessage && (
        <div className="alert-banner-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Inventory List Table */}
      <div className="users-table-container">
        {isLoading ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading verified land inventories...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state-card" id="inventories-empty-state">
            <div className="empty-state-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <h3 className="empty-state-title">No Land Inventories Found</h3>
            <p className="empty-state-desc">
              {searchTerm || statusFilter
                ? 'No inventories matched your search criteria. Try resetting your filters.'
                : isLandOfficer
                ? 'Generate an inventory from an acquisition case with completed field verification to begin.'
                : 'No verified land inventories have been submitted within your administrative scope.'}
            </p>
            {isLandOfficer && !searchTerm && !statusFilter && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenGenerateModal}
                style={{ marginTop: '0.75rem' }}
              >
                Generate First Inventory
              </button>
            )}
          </div>
        ) : (
          <table className="users-table" id="inventories-table">
            <thead>
              <tr>
                <th>Inventory ID</th>
                <th>Project Name</th>
                <th>Case Reference</th>
                <th>Version</th>
                <th>Parcels</th>
                <th>Affected Area</th>
                <th>Created By</th>
                <th>{isMinistryAdmin && viewMode === 'queue' ? 'Submission Date' : 'Generated Date'}</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const inv = row.inventory;
                const statusStyle =
                  INVENTORY_STATUS_CONFIG[inv.status] || {
                    bg: 'rgba(148, 163, 184, 0.1)',
                    color: '#94a3b8',
                    border: 'rgba(148, 163, 184, 0.2)',
                    label: inv.status,
                  };

                return (
                  <tr key={inv.id} id={`inventory-row-${inv.id}`}>
                    <td>
                      <Link
                        href={`/verified-land-inventories/${inv.id}`}
                        className="cell-id-link"
                        title={inv.id}
                        style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-secondary)' }}
                      >
                        {inv.id.substring(0, 8)}…
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.acquisitionCase.project.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {row.acquisitionCase.project.projectCode}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.acquisitionCase.caseReference}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {row.acquisitionCase.title}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                        }}
                      >
                        v{inv.versionNumber}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{inv.totalParcelCount}</span>
                    </td>
                    <td>
                      <span>{inv.aggregateAffectedArea}</span>{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.areaUnit}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8125rem' }}>{row.preparer.name}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {isMinistryAdmin && viewMode === 'queue' && inv.submittedAt
                          ? new Date(inv.submittedAt).toLocaleDateString()
                          : new Date(inv.generatedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <span
                        className="cell-status-pill"
                        style={{
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          borderColor: statusStyle.border,
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <Link
                          href={`/verified-land-inventories/${inv.id}`}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          title="View Details and Snapshots"
                        >
                          View
                        </Link>
                        {isMinistryAdmin && (inv.status === 'SUBMITTED' || inv.status === 'UNDER_REVIEW') && (
                          <Link
                            href={`/verified-land-inventories/${inv.id}`}
                            className="btn-primary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            title="Open Ministry Review"
                            id={`btn-review-${inv.id}`}
                          >
                            Review
                          </Link>
                        )}
                        {isLandOfficer && inv.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              setSubmittingInventory(row);
                              setSubmitRemarks('');
                              setSubmitError(null);
                            }}
                          >
                            Submit
                          </button>
                        )}
                        {isLandOfficer && inv.status === 'CORRECTION_REQUESTED' && (
                          <Link
                            href={`/verified-land-inventories/${inv.id}`}
                            className="btn-primary"
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              background: '#f59e0b',
                              borderColor: '#d97706',
                            }}
                            title="Generate revised version"
                          >
                            Revise
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {!isLoading && items.length > 0 && (
          <div className="users-pagination-bar" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Showing {items.length} of {total} inventories
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8125rem', padding: '0 0.5rem' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Inventory Modal */}
      {showGenerateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '580px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Generate Verified Land Inventory</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isGenerating && setShowGenerateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateInventory}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Select an acquisition case whose field verification is completed. NLAMS will compile
                  all accepted field verification reports, confirm resolution of all discrepancies, and generate
                  immutable parcel snapshots for this inventory version.
                </p>

                {generateError && (
                  <div className="alert-banner-error" style={{ fontSize: '0.8125rem' }}>
                    <span>{generateError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="select-acquisition-case"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    Eligible Acquisition Case <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  {loadingCases ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                      <span className="spinner-sm" />
                      <span>Checking for eligible cases...</span>
                    </div>
                  ) : eligibleCases.length === 0 ? (
                    <div
                      style={{
                        padding: '0.75rem',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        fontSize: '0.8125rem',
                        color: '#f87171',
                      }}
                    >
                      No eligible acquisition cases found. Inventories can only be generated for cases with
                      <strong> Field Verification Completed</strong> status.
                    </div>
                  ) : (
                    <select
                      id="select-acquisition-case"
                      value={selectedCaseId}
                      onChange={(e) => setSelectedCaseId(e.target.value)}
                      className="filter-select"
                      style={{ width: '100%', height: '40px' }}
                      required
                    >
                      <option value="">-- Select an eligible acquisition case --</option>
                      {eligibleCases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.caseReference} — {c.title} ({c.project.name}, {c.totalParcelsCount} parcels)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedCaseId && (
                  <div
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#34d399', marginBottom: '0.25rem' }}>
                      ✓ Case Validation Ready
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Generating will create an immutable parcel snapshot record for all accepted parcels,
                      calculate aggregate affected areas, and initialize inventory Version 1 (Draft).
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="generate-remarks"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    Preparation Remarks (Optional)
                  </label>
                  <textarea
                    id="generate-remarks"
                    rows={3}
                    value={generateRemarks}
                    onChange={(e) => setGenerateRemarks(e.target.value)}
                    placeholder="Enter any contextual remarks regarding this verified inventory generation..."
                    className="search-input"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={isGenerating}
                  onClick={() => setShowGenerateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isGenerating || !selectedCaseId || eligibleCases.length === 0}
                  id="btn-confirm-generate"
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner-sm" />
                      <span>Generating Snapshots...</span>
                    </>
                  ) : (
                    <span>Confirm & Generate</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Draft Inventory Modal */}
      {submittingInventory && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Submit Inventory for Ministry Review</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSubmitting && setSubmittingInventory(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitInventory}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Are you sure you want to submit{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Inventory v{submittingInventory.inventory.versionNumber}
                  </strong>{' '}
                  for case{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {submittingInventory.acquisitionCase.caseReference}
                  </strong>
                  ?
                </p>

                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    fontSize: '0.8125rem',
                    color: '#fbbf24',
                  }}
                >
                  <strong>Notice:</strong> Once submitted, the draft becomes locked and cannot be edited.
                  It will transition to <strong>SUBMITTED</strong> and be forwarded to the Ministry Administrator
                  for formal verification and approval.
                </div>

                {submitError && (
                  <div className="alert-banner-error" style={{ fontSize: '0.8125rem' }}>
                    <span>{submitError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="submit-inventory-remarks"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    Submission Remarks (Optional)
                  </label>
                  <textarea
                    id="submit-inventory-remarks"
                    rows={3}
                    value={submitRemarks}
                    onChange={(e) => setSubmitRemarks(e.target.value)}
                    placeholder="Provide any remarks or context for the Ministry review team..."
                    className="search-input"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={isSubmitting}
                  onClick={() => setSubmittingInventory(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                  id="btn-confirm-submit-inventory"
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-sm" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Confirm & Submit</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
