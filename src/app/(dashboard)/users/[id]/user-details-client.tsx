'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { UserWithDetails } from '../../../../repositories/user.repository';
import type { Role } from '../../../../../db/schema/roles';
import type { AdministrativeUnit } from '../../../../../db/schema/administrative-units';


interface UserDetailsClientProps {
  userId: string;
  currentUserId: string;
  userPermissions: string[];
  isSuperAdmin: boolean;
}

export function UserDetailsClient({
  userId,
  currentUserId,
  userPermissions,
  isSuperAdmin,
}: UserDetailsClientProps) {
  const isSelf = currentUserId === userId;
  const canUpdate = isSuperAdmin || userPermissions.includes('USER_UPDATE');
  const canAssignRole = (isSuperAdmin || userPermissions.includes('ROLE_ASSIGN')) && !isSelf;
  const canAssignUnit = (isSuperAdmin || userPermissions.includes('USER_ASSIGN')) && !isSelf;

  const [user, setUser] = useState<UserWithDetails | null>(null);
  const [delegatableRoles, setDelegatableRoles] = useState<Role[]>([]);
  const [accessibleUnits, setAccessibleUnits] = useState<AdministrativeUnit[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false);
  const [isAssignRoleOpen, setIsAssignRoleOpen] = useState(false);
  const [isNewAssignmentOpen, setIsNewAssignmentOpen] = useState(false);
  const [assignmentToEdit, setAssignmentToEdit] = useState<{
    id: string;
    unitName: string;
    status: 'ACTIVE' | 'INACTIVE';
    endDate: string | null;
  } | null>(null);
  const [roleToRevoke, setRoleToRevoke] = useState<Role | null>(null);

  // Edit Status Form State
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [editStatusError, setEditStatusError] = useState<string | null>(null);


  // Assign Role Form State
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [assignRoleError, setAssignRoleError] = useState<string | null>(null);

  // New Assignment Form State
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [assignmentStartDate, setAssignmentStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [assignmentEndDate, setAssignmentEndDate] = useState('');
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Edit Assignment Form State
  const [editAssignmentStatus, setEditAssignmentStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editAssignmentEndDate, setEditAssignmentEndDate] = useState('');
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [editAssignmentError, setEditAssignmentError] = useState<string | null>(null);

  // Revoke Role State
  const [isRevokingRole, setIsRevokingRole] = useState(false);
  const [revokeRoleError, setRevokeRoleError] = useState<string | null>(null);

  // Fetch User Details
  const loadUserDetails = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
          throw new Error('User not found or inaccessible within your administrative scope.');
        }
        throw new Error('Failed to load user details.');
      }

      const json = await res.json();
      if (json.success) {
        setUser(json.data);
        setEditStatus(json.data.status);
      } else {
        throw new Error(json.error || 'Failed to load user');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUserDetails();
  }, [loadUserDetails]);

  // Fetch Delegatable Roles and Accessible Units if allowed
  useEffect(() => {
    async function loadOptions() {
      try {
        if (canAssignRole) {
          const res = await fetch('/api/roles');
          if (res.ok) {
            const json = await res.json();
            if (json.success) {
              setDelegatableRoles(json.data);
              if (json.data.length > 0) setSelectedRoleId(json.data[0].id);
            }
          }
        }

        if (canAssignUnit) {
          const res = await fetch('/api/administrative-units');
          if (res.ok) {
            const json = await res.json();
            if (json.success) {
              setAccessibleUnits(json.data);
              if (json.data.length > 0) setSelectedUnitId(json.data[0].id);
            }
          }
        }
      } catch {
        // Silently catch option loads
      }
    }

    loadOptions();
  }, [canAssignRole, canAssignUnit]);

  // 1. Submit Account Status Update
  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStatus(true);
    setEditStatusError(null);

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update account status');
      }

      setUser(json.data);
      setIsEditStatusOpen(false);
      setSuccessMessage('Account status updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setEditStatusError(
        err instanceof Error ? err.message : 'Failed to update status'
      );
    } finally {
      setIsSavingStatus(false);
    }
  };


  // 2. Submit Role Assignment
  const handleAssignRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAssigningRole(true);
    setAssignRoleError(null);

    try {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRoleId }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to assign role');
      }

      setUser(json.data);
      setIsAssignRoleOpen(false);
      setSuccessMessage('Role assigned successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setAssignRoleError(
        err instanceof Error ? err.message : 'Failed to assign role'
      );
    } finally {
      setIsAssigningRole(false);
    }
  };

  // 3. Confirm Role Revocation
  const handleRevokeRoleConfirm = async () => {
    if (!roleToRevoke) return;
    setIsRevokingRole(true);
    setRevokeRoleError(null);

    try {
      const res = await fetch(`/api/users/${userId}/roles/${roleToRevoke.id}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to revoke role');
      }

      setUser(json.data);
      setRoleToRevoke(null);
      setSuccessMessage(`Role '${roleToRevoke.name}' revoked successfully.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setRevokeRoleError(
        err instanceof Error ? err.message : 'Failed to revoke role'
      );
    } finally {
      setIsRevokingRole(false);
    }
  };

  // 4. Submit New Administrative Assignment
  const handleNewAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingAssignment(true);
    setAssignmentError(null);

    try {
      const payload: Record<string, unknown> = {
        administrativeUnitId: selectedUnitId,
        startDate: assignmentStartDate,
      };

      if (assignmentEndDate.trim()) {
        payload.endDate = assignmentEndDate.trim();
      }

      const res = await fetch(`/api/users/${userId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create administrative assignment');
      }

      setUser(json.data);
      setIsNewAssignmentOpen(false);
      setAssignmentEndDate('');
      setSuccessMessage('Administrative assignment created successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setAssignmentError(
        err instanceof Error ? err.message : 'Failed to create assignment'
      );
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  // 5. Submit Assignment Edit / End
  const handleEditAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentToEdit) return;
    setIsSavingAssignment(true);
    setEditAssignmentError(null);

    try {
      const payload: Record<string, unknown> = {
        status: editAssignmentStatus,
        endDate: editAssignmentEndDate.trim() || null,
      };

      const res = await fetch(
        `/api/users/${userId}/assignments/${assignmentToEdit.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update assignment');
      }

      setUser(json.data);
      setAssignmentToEdit(null);
      setSuccessMessage('Administrative assignment updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setEditAssignmentError(
        err instanceof Error ? err.message : 'Failed to update assignment'
      );
    } finally {
      setIsSavingAssignment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="users-page">
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading user details...</span>
        </div>
      </div>
    );
  }

  if (errorMessage || !user) {
    return (
      <div className="users-page">
        <div className="alert-error-banner" id="user-details-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage || 'User not found'}</span>
        </div>
        <Link href="/users" className="btn-secondary" style={{ alignSelf: 'flex-start' }}>
          ← Back to Users
        </Link>
      </div>
    );
  }

  // Filter out roles user already holds for assign role dropdown
  const availableRolesToAssign = delegatableRoles.filter(
    (dr) => !user.roles.some((ur) => ur.id === dr.id)
  );

  return (
    <div className="users-page">
      {/* Breadcrumb & Header */}
      <div className="page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
            <Link href="/users" style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}>
              Users
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>{user.name}</span>
          </div>
          <h1 className="page-title">{user.name}</h1>
          <p className="page-subtitle">
            User ID: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{user.id}</span>
          </p>
        </div>

        <div className="page-actions-group">
          <Link href="/users" className="btn-secondary">
            ← Back to Users
          </Link>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="alert-success-banner" id="user-details-success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Dual Layout */}
      <div className="user-details-layout">
        {/* Left: User Profile Summary Card */}
        <div className="user-profile-card">
          <div className="user-avatar-header">
            <div className="user-large-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>
                {user.name}
              </h2>
              <span
                className={`badge-status ${
                  user.status === 'ACTIVE'
                    ? 'active'
                    : user.status === 'SUSPENDED'
                    ? 'suspended'
                    : 'inactive'
                }`}
                style={{ marginTop: '0.25rem' }}
              >
                {user.status}
              </span>
            </div>
          </div>

          <div className="detail-info-row">
            <span className="detail-info-label">Email Address</span>
            <span className="detail-info-value">{user.email}</span>
          </div>

          <div className="detail-info-row">
            <span className="detail-info-label">Phone</span>
            <span className="detail-info-value">{user.phone || '—'}</span>
          </div>

          <div className="detail-info-row">
            <span className="detail-info-label">Member Since</span>
            <span className="detail-info-value">
              {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>

          <div className="detail-info-row" style={{ borderBottom: 'none' }}>
            <span className="detail-info-label">Last Profile Update</span>
            <span className="detail-info-value">
              {new Date(user.updatedAt).toLocaleDateString()}
            </span>
          </div>

          {canUpdate && !isSelf && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditStatus(user.status);
                setIsEditStatusOpen(true);
              }}
              id="btn-open-edit-status"
            >
              Update Account Status
            </button>
          )}

        </div>

        {/* Right: Roles & Administrative Assignments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Assigned System Roles Card */}
          <div className="user-sub-card">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Assigned Roles</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  System security roles determining feature capabilities and delegated authority.
                </p>
              </div>

              {canAssignRole && availableRolesToAssign.length > 0 && (
                <button
                  type="button"
                  className="btn-accent"
                  onClick={() => setIsAssignRoleOpen(true)}
                  id="btn-open-assign-role"
                >
                  + Assign Role
                </button>
              )}
            </div>

            <div className="items-list-group">
              {user.roles.map((r) => (
                <div key={r.id} className="item-row-card" id={`role-item-${r.id}`}>
                  <div className="item-row-info">
                    <span className="item-row-title">{r.name}</span>
                    <span className="item-row-subtitle">{r.description}</span>
                  </div>

                  {canAssignRole && (
                    <button
                      type="button"
                      className="btn-danger-sm"
                      onClick={() => setRoleToRevoke(r)}
                      disabled={user.roles.length <= 1}
                      title={
                        user.roles.length <= 1
                          ? 'User must maintain at least one role'
                          : 'Revoke role'
                      }
                      id={`btn-revoke-role-${r.id}`}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Administrative Hierarchy Assignments Card */}
          <div className="user-sub-card">
            <div className="card-header-flex">
              <div>
                <h3 className="card-heading-title">Administrative Assignments</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Jurisdictional scope boundaries governing which land administrative units this user oversees.
                </p>
              </div>

              {canAssignUnit && accessibleUnits.length > 0 && (
                <button
                  type="button"
                  className="btn-accent"
                  onClick={() => setIsNewAssignmentOpen(true)}
                  id="btn-open-new-assignment"
                >
                  + New Assignment
                </button>
              )}
            </div>

            {user.assignments.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No administrative unit assignments found for this user.
              </p>
            ) : (
              <div className="items-list-group">
                {user.assignments.map((a) => (
                  <div key={a.id} className="item-row-card" id={`assignment-item-${a.id}`}>
                    <div className="item-row-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="item-row-title">{a.administrativeUnitName}</span>
                        <span
                          className={`badge-status ${
                            a.status === 'ACTIVE' ? 'active' : 'inactive'
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                      <span className="item-row-subtitle">
                        Code: {a.administrativeUnitCode} • Type: {a.administrativeUnitType}
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        Effective: {a.startDate} {a.endDate ? `to ${a.endDate}` : '(Current)'}
                      </span>
                    </div>

                    {canAssignUnit && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setAssignmentToEdit({
                            id: a.id,
                            unitName: a.administrativeUnitName,
                            status: a.status,
                            endDate: a.endDate,
                          });
                          setEditAssignmentStatus(a.status);
                          setEditAssignmentEndDate(a.endDate || '');
                        }}
                        id={`btn-edit-assignment-${a.id}`}
                      >
                        Modify / End
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal 1: Update Account Status */}
      {isEditStatusOpen && !isSelf && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Update Account Status</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEditStatusOpen(false)}
              >
                ✕
              </button>
            </div>

            {editStatusError && (
              <div className="modal-alert-error">{editStatusError}</div>
            )}

            <form onSubmit={handleUpdateStatusSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">User</label>
                <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>
                  {user.name} ({user.email})
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-status-select">
                  Account Status
                </label>
                <select
                  id="edit-status-select"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED')
                  }
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Note: Personal information (name, email, phone) cannot be altered after account creation to protect user identity and audit integrity.
              </p>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsEditStatusOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSavingStatus}
                  id="btn-save-status"
                >
                  {isSavingStatus ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Modal 2: Assign Role */}
      {isAssignRoleOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Assign Authorized Role</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAssignRoleOpen(false)}
              >
                ✕
              </button>
            </div>

            {assignRoleError && (
              <div className="modal-alert-error">{assignRoleError}</div>
            )}

            <form onSubmit={handleAssignRoleSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="assign-role-select">
                  Select Role to Delegate
                </label>
                <select
                  id="assign-role-select"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                >
                  {availableRolesToAssign.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsAssignRoleOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isAssigningRole || !selectedRoleId}
                  id="btn-confirm-assign-role"
                >
                  {isAssigningRole ? 'Assigning...' : 'Assign Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Revoke Role Confirmation */}
      {roleToRevoke && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#f87171' }}>
                Revoke Role Confirmation
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRoleToRevoke(null)}
              >
                ✕
              </button>
            </div>

            {revokeRoleError && (
              <div className="modal-alert-error">{revokeRoleError}</div>
            )}

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Are you sure you want to revoke the role <strong style={{ color: '#fff' }}>{roleToRevoke.name}</strong> from user <strong style={{ color: '#fff' }}>{user.name}</strong>?
            </p>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setRoleToRevoke(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-sm"
                style={{ padding: '0.625rem 1.125rem', fontSize: '0.8125rem' }}
                disabled={isRevokingRole}
                onClick={handleRevokeRoleConfirm}
                id="btn-confirm-revoke-role"
              >
                {isRevokingRole ? 'Revoking...' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: New Administrative Assignment */}
      {isNewAssignmentOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">New Administrative Unit Assignment</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsNewAssignmentOpen(false)}
              >
                ✕
              </button>
            </div>

            {assignmentError && (
              <div className="modal-alert-error">{assignmentError}</div>
            )}

            <form onSubmit={handleNewAssignmentSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="new-assignment-unit">
                  Administrative Unit
                </label>
                <select
                  id="new-assignment-unit"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  {accessibleUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}) — {u.type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="assignment-start-date">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="assignment-start-date"
                    className="search-input"
                    style={{ paddingLeft: '1rem' }}
                    required
                    value={assignmentStartDate}
                    onChange={(e) => setAssignmentStartDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="assignment-end-date">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    id="assignment-end-date"
                    className="search-input"
                    style={{ paddingLeft: '1rem' }}
                    value={assignmentEndDate}
                    onChange={(e) => setAssignmentEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsNewAssignmentOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isCreatingAssignment || !selectedUnitId}
                  id="btn-confirm-create-assignment"
                >
                  {isCreatingAssignment ? 'Assigning...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Modify / End Assignment */}
      {assignmentToEdit && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Modify Administrative Assignment</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAssignmentToEdit(null)}
              >
                ✕
              </button>
            </div>

            {editAssignmentError && (
              <div className="modal-alert-error">{editAssignmentError}</div>
            )}

            <form onSubmit={handleEditAssignmentSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Administrative Unit</label>
                <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>
                  {assignmentToEdit.unitName}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-assignment-status">
                  Assignment Status
                </label>
                <select
                  id="edit-assignment-status"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  value={editAssignmentStatus}
                  onChange={(e) =>
                    setEditAssignmentStatus(e.target.value as 'ACTIVE' | 'INACTIVE')
                  }
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-assignment-end-date">
                  End Date
                </label>
                <input
                  type="date"
                  id="edit-assignment-end-date"
                  className="search-input"
                  style={{ paddingLeft: '1rem' }}
                  value={editAssignmentEndDate}
                  onChange={(e) => setEditAssignmentEndDate(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setAssignmentToEdit(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSavingAssignment}
                  id="btn-confirm-save-assignment"
                >
                  {isSavingAssignment ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
