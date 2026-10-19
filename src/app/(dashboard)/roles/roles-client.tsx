'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Permission {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
}

interface RolesClientProps {
  isSuperAdmin: boolean;
  userPermissions: string[];
}

// ---------------------------------------------------------------------------
// Permission category grouping
// ---------------------------------------------------------------------------

const PERMISSION_CATEGORIES: Record<string, string[]> = {
  'User Management': ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_ASSIGN'],
  'Role Management': ['ROLE_VIEW', 'ROLE_ASSIGN'],
  'Administrative Units': ['ADMIN_UNIT_VIEW', 'ADMIN_UNIT_CREATE', 'ADMIN_UNIT_UPDATE'],
  'Project Management': ['PROJECT_VIEW', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_REGISTER'],
};



const ROLE_COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  SUPER_ADMIN:     { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#f87171' },
  MINISTRY_ADMIN:  { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  text: '#fbbf24' },
  PROJECT_OFFICER: { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  text: '#60a5fa' },
  LAND_OFFICER:    { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)', text: '#6ee7b7' },
  FIELD_OFFICER:   { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)', text: '#c4b5fd' },
};

const DEFAULT_ROLE_STYLE = { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.35)', text: '#94a3b8' };

function getRoleStyle(name: string) {
  return ROLE_COLOR_MAP[name] ?? DEFAULT_ROLE_STYLE;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RolesClient({ isSuperAdmin }: RolesClientProps) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add permission modal
  const [showAddPerm, setShowAddPerm] = useState(false);
  const [addPermId, setAddPermId] = useState('');
  const [addPermLoading, setAddPermLoading] = useState(false);
  const [addPermError, setAddPermError] = useState<string | null>(null);

  // Remove confirmation
  const [removingPermId, setRemovingPermId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles/all'),
        fetch('/api/permissions'),
      ]);

      if (rolesRes.status === 403 || permsRes.status === 403) {
        setErrorMessage('You do not have permission to view roles and permissions.');
        return;
      }

      if (!rolesRes.ok || !permsRes.ok) {
        throw new Error('Failed to load roles and permissions data.');
      }

      const rolesJson = await rolesRes.json();
      const permsJson = await permsRes.json();

      if (rolesJson.success) {
        const loadedRoles: RoleWithPermissions[] = rolesJson.data;
        setRoles(loadedRoles);
        // Reselect the previously selected role if still in the list
        if (selectedRole) {
          const refreshed = loadedRoles.find((r) => r.id === selectedRole.id);
          setSelectedRole(refreshed ?? loadedRoles[0] ?? null);
        } else {
          setSelectedRole(loadedRoles[0] ?? null);
        }
      }

      if (permsJson.success) {
        setAllPermissions(permsJson.data);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -------------------------------------------------------------------------
  // Add Permission
  // -------------------------------------------------------------------------

  const handleAddPermission = async () => {
    if (!selectedRole || !addPermId) return;
    setAddPermLoading(true);
    setAddPermError(null);
    try {
      const res = await fetch(`/api/roles/${selectedRole.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId: addPermId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to add permission');
      }
      // Update local state with the returned role
      const updatedRole: RoleWithPermissions = json.data;
      setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
      setSelectedRole(updatedRole);
      setShowAddPerm(false);
      setAddPermId('');
      showToast(`Permission added successfully.`, 'success');
    } catch (err: unknown) {
      setAddPermError(err instanceof Error ? err.message : 'Failed to add permission');
    } finally {
      setAddPermLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Remove Permission
  // -------------------------------------------------------------------------

  const handleRemovePermission = async (permId: string, permName: string) => {
    if (!selectedRole) return;
    setRemovingPermId(permId);
    try {
      const res = await fetch(`/api/roles/${selectedRole.id}/permissions/${permId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to remove permission');
      }
      const updatedRole: RoleWithPermissions = json.data;
      setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
      setSelectedRole(updatedRole);
      showToast(`Permission '${permName}' removed.`, 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to remove permission',
        'error'
      );
    } finally {
      setRemovingPermId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const grantedPermIds = new Set(selectedRole?.permissions.map((p) => p.id) ?? []);
  const availableToAdd = allPermissions.filter((p) => !grantedPermIds.has(p.id));

  // Group selected role's permissions by category
  const groupedPermissions = selectedRole
    ? (() => {
        const permByName = new Map(selectedRole.permissions.map((p) => [p.name, p]));
        const grouped: { category: string; perms: Permission[] }[] = [];
        const placed = new Set<string>();

        for (const [category, names] of Object.entries(PERMISSION_CATEGORIES)) {
          const perms = names
            .map((n) => permByName.get(n))
            .filter((p): p is Permission => p !== undefined);
          if (perms.length > 0) {
            grouped.push({ category, perms });
            perms.forEach((p) => placed.add(p.id));
          }
        }

        // Uncategorised permissions
        const other = selectedRole.permissions.filter((p) => !placed.has(p.id));
        if (other.length > 0) {
          grouped.push({ category: 'Other', perms: other });
        }

        return grouped;
      })()
    : [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="roles-page">
      {/* Toast notification */}
      {toast && (
        <div className={`roles-toast ${toast.type}`} role="alert" aria-live="polite">
          {toast.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Roles &amp; Permissions</h1>
          <p className="page-subtitle">
            Review system roles, inspect their granted permissions, and manage role-permission assignments.
          </p>
        </div>
        <div className="roles-header-stats">
          <div className="roles-stat-chip">
            <span className="roles-stat-value">{roles.length}</span>
            <span className="roles-stat-label">Roles</span>
          </div>
          <div className="roles-stat-chip">
            <span className="roles-stat-value">{allPermissions.length}</span>
            <span className="roles-stat-label">Permissions</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="alert-error-banner" id="roles-error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="empty-state-card">
          <span className="spinner-sm" />
          <span>Loading roles and permissions...</span>
        </div>
      ) : (
        <div className="roles-dual-layout">
          {/* LEFT: Role list */}
          <div className="roles-list-panel">
            <div className="roles-panel-header">
              <h2 className="roles-panel-title">System Roles</h2>
              <span className="roles-panel-subtitle">Select a role to inspect</span>
            </div>
            <ul className="roles-list" role="listbox" aria-label="System roles">
              {roles.map((role) => {
                const style = getRoleStyle(role.name);
                const isSelected = selectedRole?.id === role.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      className={`role-list-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedRole(role)}
                      id={`role-item-${role.id}`}
                      aria-pressed={isSelected}
                      style={isSelected ? { borderColor: style.border, background: style.bg } : undefined}
                    >
                      <div className="role-list-item-row">
                        <span
                          className="role-list-badge"
                          style={{
                            background: style.bg,
                            border: `1px solid ${style.border}`,
                            color: style.text,
                          }}
                        >
                          {role.name}
                        </span>
                      </div>
                      {role.description && (
                        <p className="role-list-description">{role.description}</p>
                      )}
                      <div className="role-list-meta">
                        <span>{role.permissions.length} permissions</span>
                        {role.isSystemRole && <span className="role-system-tag">System</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* RIGHT: Role detail */}
          <div className="roles-detail-panel">
            {!selectedRole ? (
              <div className="empty-state-card" style={{ height: '100%' }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <p style={{ fontWeight: 600, color: '#fff' }}>Select a role</p>
                <p style={{ fontSize: '0.8125rem' }}>Choose a role from the left panel to inspect its permissions.</p>
              </div>
            ) : (
              <>
                {/* Role header card */}
                <div className="role-detail-header-card">
                  {(() => {
                    const style = getRoleStyle(selectedRole.name);
                    return (
                      <>
                        <div className="role-detail-icon" style={{ background: style.bg, border: `1.5px solid ${style.border}` }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={style.text} strokeWidth="1.8">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                        <div className="role-detail-meta">
                          <div className="role-detail-name-row">
                            <h2 className="role-detail-name" style={{ color: style.text }}>{selectedRole.name}</h2>
                            {selectedRole.isSystemRole && <span className="role-system-tag">System Role</span>}
                          </div>
                          {selectedRole.description && (
                            <p className="role-detail-description">{selectedRole.description}</p>
                          )}
                          <div className="role-detail-chips-row">
                            <span className="role-detail-chip">
                              🔒 {selectedRole.permissions.length} Permissions
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Permissions section */}
                <div className="role-permissions-section">
                  <div className="role-perms-section-header">
                    <h3 className="role-perms-title">Granted Permissions</h3>
                    {isSuperAdmin && availableToAdd.length > 0 && (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.875rem', fontSize: '0.8125rem' }}
                        onClick={() => { setShowAddPerm(true); setAddPermId(''); setAddPermError(null); }}
                        id="btn-add-permission"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Permission
                      </button>
                    )}
                  </div>

                  {/* Add permission inline form */}
                  {showAddPerm && (
                    <div className="add-perm-form-card">
                      <p className="add-perm-form-label">Grant a permission to <strong>{selectedRole.name}</strong></p>
                      <div className="add-perm-form-row">
                        <select
                          className="filter-select"
                          value={addPermId}
                          onChange={(e) => setAddPermId(e.target.value)}
                          id="select-add-permission"
                          style={{ flex: 1 }}
                        >
                          <option value="">Select a permission...</option>
                          {availableToAdd.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.description ? ` — ${p.description}` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '0.4rem 0.875rem', fontSize: '0.8125rem' }}
                          onClick={handleAddPermission}
                          disabled={!addPermId || addPermLoading}
                          id="btn-confirm-add-permission"
                        >
                          {addPermLoading ? 'Granting…' : 'Grant'}
                        </button>
                        <button
                          type="button"
                          className="btn-cancel"
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
                          onClick={() => { setShowAddPerm(false); setAddPermError(null); }}
                          id="btn-cancel-add-permission"
                        >
                          Cancel
                        </button>
                      </div>
                      {addPermError && (
                        <p className="form-error-inline">{addPermError}</p>
                      )}
                    </div>
                  )}

                  {selectedRole.permissions.length === 0 ? (
                    <div className="empty-state-card" style={{ padding: '2rem' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p>No permissions granted to this role.</p>
                    </div>
                  ) : (
                    <div className="perm-categories-list">
                      {groupedPermissions.map(({ category, perms }) => (
                        <div key={category} className="perm-category-block">
                          <h4 className="perm-category-heading">{category}</h4>
                          <div className="perm-items-grid">
                            {perms.map((perm) => (
                              <div key={perm.id} className="perm-item-card" id={`perm-card-${perm.id}`}>
                                <div className="perm-item-info">
                                  <span className="perm-item-name">{perm.name}</span>
                                  {perm.description && (
                                    <span className="perm-item-desc">{perm.description}</span>
                                  )}
                                </div>
                                {isSuperAdmin && (
                                  <button
                                    type="button"
                                    className="perm-remove-btn"
                                    onClick={() => handleRemovePermission(perm.id, perm.name)}
                                    disabled={removingPermId === perm.id}
                                    title={`Remove ${perm.name} from ${selectedRole.name}`}
                                    id={`btn-remove-perm-${perm.id}`}
                                    aria-label={`Remove ${perm.name}`}
                                  >
                                    {removingPermId === perm.id ? (
                                      <span className="spinner-sm" style={{ width: 12, height: 12 }} />
                                    ) : (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* All system permissions reference */}
                {isSuperAdmin && (
                  <div className="all-perms-reference">
                    <details>
                      <summary className="all-perms-summary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        All {allPermissions.length} System Permissions Reference
                      </summary>
                      <div className="all-perms-grid">
                        {Object.entries(PERMISSION_CATEGORIES).map(([category, names]) => {
                          const catPerms = allPermissions.filter((p) => names.includes(p.name));
                          if (catPerms.length === 0) return null;
                          return (
                            <div key={category} className="all-perm-category">
                              <h5 className="all-perm-category-title">{category}</h5>
                              {catPerms.map((p) => (
                                <div key={p.id} className="all-perm-row">
                                  <span className="all-perm-name">{p.name}</span>
                                  {grantedPermIds.has(p.id) && (
                                    <span className="all-perm-granted-badge">Granted</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
