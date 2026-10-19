'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ProjectWithRelations } from '../../../repositories/project.repository';
import type { ImplementingAgency } from '../../../../db/schema/implementing-agencies';
import { PROJECT_TYPES, PROJECT_STATUSES } from '../../../../db/schema/projects';

interface ProjectsClientProps {
  userPermissions: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

export function ProjectsClient({
  userPermissions,
  isSuperAdmin,
}: ProjectsClientProps) {
  const canCreate = isSuperAdmin || userPermissions.includes('PROJECT_CREATE');

  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [agencies, setAgencies] = useState<ImplementingAgency[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch agencies for filter dropdown
  useEffect(() => {
    async function fetchAgencies() {
      try {
        const res = await fetch('/api/implementing-agencies?limit=100');
        if (res.ok) {
          const json = await res.json();
          if (json.success) setAgencies(json.data);
        }
      } catch {
        // Non-fatal for filter options
      }
    }
    fetchAgencies();
  }, []);

  // Fetch projects
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('projectType', typeFilter);
      if (agencyFilter) params.set('implementingAgencyId', agencyFilter);

      const res = await fetch(`/api/projects?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view projects in this administrative scope.');
        }
        throw new Error('Failed to load projects list.');
      }

      const json = await res.json();
      if (json.success) {
        setProjects(json.data);
        setTotal(json.pagination.total);
        setTotalPages(json.pagination.totalPages || 1);
      } else {
        throw new Error(json.error || 'Failed to load projects');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchTerm, statusFilter, typeFilter, agencyFilter]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProjects();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setTypeFilter('');
    setAgencyFilter('');
    setPage(1);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'REGISTERED':
        return 'badge-status active';
      case 'DRAFT':
        return 'badge-status inactive';
      case 'ON_HOLD':
        return 'badge-status suspended';
      case 'COMPLETED':
        return 'badge-status active';
      case 'CANCELLED':
        return 'badge-status suspended';
      default:
        return 'badge-status inactive';
    }
  };

  const hasActiveFilters = searchTerm || statusFilter || typeFilter || agencyFilter;

  return (
    <div className="users-page">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Project Management</h1>
          <p className="page-subtitle">
            Manage public infrastructure and land acquisition initiatives across the administrative hierarchy.
          </p>
        </div>

        <div className="page-actions-group">
          {canCreate && (
            <Link href="/projects/new" className="btn-primary" id="btn-create-project-nav">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Project</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="users-filter-bar">
        {/* Search — occupies first grid column (flex: 1) */}
        <div className="tree-search-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by project name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="project-search-input"
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

        {/* Status filter */}
        <div className="filter-item">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            id="filter-status-select"
          >
            <option value="">All Statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Type filter */}
        <div className="filter-item">
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            id="filter-type-select"
          >
            <option value="">All Project Types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Agency filter — always rendered to keep the grid stable; disabled when no agencies */}
        <div className="filter-item">
          <select
            className="filter-select"
            value={agencyFilter}
            onChange={(e) => {
              setAgencyFilter(e.target.value);
              setPage(1);
            }}
            id="filter-agency-select"
            disabled={agencies.length === 0}
          >
            <option value="">All Implementing Agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </div>

        {/* Reset button — only visible when there are active filters */}
        {hasActiveFilters && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleResetFilters}
            id="btn-reset-filters"
            style={{ whiteSpace: 'nowrap' }}
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

      {/* Projects Table */}
      <div className="users-table-container">
        {isLoading ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading projects in authorized administrative scope...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state-card" id="projects-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontWeight: 600, color: '#fff' }}>No projects found</p>
            <p style={{ fontSize: '0.8125rem' }}>
              No projects match the selected administrative scope or filter criteria.
            </p>
            {canCreate && (
              <Link href="/projects/new" className="btn-primary" style={{ marginTop: '0.75rem' }}>
                Create First Project
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Horizontal scroll wrapper prevents page-wide overflow */}
            <div className="users-table-scroll">
              <table className="users-table projects-table">
                <colgroup>
                  <col className="col-details" />
                  <col className="col-type" />
                  <col className="col-agency" />
                  <col className="col-unit" />
                  <col className="col-acq" />
                  <col className="col-status" />
                  <col className="col-created" />
                  <col className="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Project Details</th>
                    <th>Type</th>
                    <th>Implementing Agency</th>
                    <th>Administrative Unit</th>
                    <th>Acquisition</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} id={`project-row-${p.id}`}>
                      <td>
                        <div className="user-name-cell">
                          <Link
                            href={`/projects/${p.id}`}
                            className="user-display-name cell-truncate"
                            style={{ textDecoration: 'none', color: '#fff' }}
                            title={p.name}
                          >
                            {p.name}
                          </Link>
                          <span
                            className="cell-truncate"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.75rem',
                              color: 'var(--accent-secondary)',
                            }}
                            title={p.projectCode}
                          >
                            {p.projectCode}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="role-tag-badge">{p.projectType}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <span
                            className="cell-truncate"
                            style={{ fontSize: '0.8125rem', color: '#fff' }}
                            title={p.implementingAgency?.name ?? '—'}
                          >
                            {p.implementingAgency?.name ?? '—'}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {p.implementingAgency?.code}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <span
                            className="cell-truncate"
                            style={{ fontSize: '0.8125rem', color: '#fff' }}
                            title={p.administrativeUnit?.name ?? '—'}
                          >
                            {p.administrativeUnit?.name ?? '—'}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {p.administrativeUnit?.code} • {p.administrativeUnit?.type}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: p.landAcquisitionRequired
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(100, 116, 139, 0.15)',
                            color: p.landAcquisitionRequired ? '#f87171' : 'var(--text-muted)',
                            fontWeight: 500,
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.landAcquisitionRequired ? 'Required' : 'Not Req.'}
                        </span>
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(p.status)}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          id={`btn-view-project-${p.id}`}
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="pagination-bar">
              <span className="pagination-info">
                Showing {projects.length > 0 ? (page - 1) * limit + 1 : 0}–
                {Math.min(page * limit, total)} of {total} project{total !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  id="btn-prev-page"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  id="btn-next-page"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
