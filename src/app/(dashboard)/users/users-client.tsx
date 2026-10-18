'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { UserWithDetails } from '../../../repositories/user.repository';
import type { Role } from '../../../../db/schema/roles';
import type { AdministrativeUnit } from '../../../../db/schema/administrative-units';

interface UsersClientProps {
  userPermissions: string[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

export function UsersClient({
  userPermissions,
  isSuperAdmin,
}: UsersClientProps) {
  const canCreate = isSuperAdmin || userPermissions.includes('USER_CREATE');

  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');

  const [roles, setRoles] = useState<Role[]>([]);
  const [units, setUnits] = useState<AdministrativeUnit[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch roles and units for filter dropdowns
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [rolesRes, unitsRes] = await Promise.all([
          fetch('/api/roles'),
          fetch('/api/administrative-units'),
        ]);

        if (rolesRes.ok) {
          const rolesJson = await rolesRes.json();
          if (rolesJson.success) setRoles(rolesJson.data);
        }
        if (unitsRes.ok) {
          const unitsJson = await unitsRes.json();
          if (unitsJson.success) setUnits(unitsJson.data);
        }
      } catch {
        // Non-fatal for filter options
      }
    }
    fetchMetadata();
  }, []);

  // Fetch users with current query filters
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('roleId', roleFilter);
      if (unitFilter) params.set('administrativeUnitId', unitFilter);

      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view users.');
        }
        throw new Error('Failed to load users list.');
      }

      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
        setTotal(json.pagination.total);
        setTotalPages(json.pagination.totalPages || 1);
      } else {
        throw new Error(json.error || 'Failed to load users');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, searchTerm, statusFilter, roleFilter, unitFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setRoleFilter('');
    setUnitFilter('');
    setPage(1);
  };

  return (
    <div className="users-page">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">User & Authority Management</h1>
          <p className="page-subtitle">
            Manage users, assign delegated system roles, and govern administrative scopes across the hierarchy.
          </p>
        </div>

        <div className="page-actions-group">
          {canCreate && (
            <Link href="/users/new" className="btn-primary" id="btn-create-user-nav">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create User</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="users-filter-bar">
        <div className="tree-search-wrapper" style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="user-search-input"
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
            className="filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            id="filter-status-select"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        {roles.length > 0 && (
          <div className="filter-item">
            <select
              className="filter-select"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              id="filter-role-select"
            >
              <option value="">All Roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {units.length > 0 && (
          <div className="filter-item">
            <select
              className="filter-select"
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setPage(1);
              }}
              id="filter-unit-select"
            >
              <option value="">All Administrative Units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.type})
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" className="btn-secondary" id="btn-filter-apply">
          Apply Filters
        </button>

        {(searchTerm || statusFilter || roleFilter || unitFilter) && (
          <button
            type="button"
            className="btn-cancel"
            onClick={handleResetFilters}
            id="btn-filter-reset"
          >
            Reset
          </button>
        )}
      </form>

      {/* Error Banner */}
      {errorMessage && (
        <div className="alert-error-banner" id="users-error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="users-table-container">
        {isLoading ? (
          <div className="empty-state-card">
            <span className="spinner-sm" />
            <span>Loading users in authorized scope...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state-card" id="users-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p style={{ fontWeight: 600, color: '#fff' }}>No users found</p>
            <p style={{ fontSize: '0.8125rem' }}>
              No users match the selected administrative scope or filter criteria.
            </p>
          </div>
        ) : (
          <>
            <table className="users-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Administrative Unit</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const activeAssignment = u.assignments.find((a) => a.status === 'ACTIVE');
                  return (
                    <tr key={u.id} id={`user-row-${u.id}`}>
                      <td>
                        <div className="user-name-cell">
                          <span className="user-display-name">{u.name}</span>
                          <span className="user-display-email">{u.email}</span>
                          {u.phone && (
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              📞 {u.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge-status ${
                            u.status === 'ACTIVE'
                              ? 'active'
                              : u.status === 'SUSPENDED'
                              ? 'suspended'
                              : 'inactive'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {u.roles.map((r) => (
                            <span key={r.id} className="role-tag-badge">
                              {r.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {activeAssignment ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="unit-tag-badge">
                              🏛️ {activeAssignment.administrativeUnitName}
                            </span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                              {activeAssignment.administrativeUnitCode} • {activeAssignment.administrativeUnitType}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            No active unit
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          href={`/users/${u.id}`}
                          className="btn-secondary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                          id={`btn-manage-user-${u.id}`}
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="table-pagination-footer">
              <span>
                Showing {users.length} of {total} {total === 1 ? 'user' : 'users'}
              </span>

              <div className="pagination-btn-group">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  id="btn-pagination-prev"
                >
                  ← Previous
                </button>
                <span style={{ alignSelf: 'center', padding: '0 0.5rem', fontWeight: 600 }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  id="btn-pagination-next"
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
