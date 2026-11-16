'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { COMPETENT_AUTHORITY_DESIGNATIONS } from '../../../validators/competent-authorities/create-authority.schema';

interface JurisdictionItem {
  id: string;
  authorityId: string;
  stateId: string;
  districtId: string | null;
  talukId: string | null;
  villageId: string | null;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  state?: { id: string; name: string; code: string };
  district?: { id: string; name: string; code: string } | null;
  taluk?: { id: string; name: string; code: string } | null;
  village?: { id: string; name: string; code: string } | null;
}

interface AssignedUserItem {
  id: string;
  authorityId: string;
  userId: string;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignedBy: string;
  user?: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
}

interface CompetentAuthorityItem {
  id: string;
  authorityCode: string;
  authorityName: string;
  designation: string;
  authorityLevel: 'DISTRICT' | 'REGIONAL' | 'STATE' | 'CENTRAL';
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  effectiveUntil: string | null;
  jurisdictions?: JurisdictionItem[];
  userAssignments?: AssignedUserItem[];
  createdAt?: string;
  updatedAt?: string;
}

interface AdminUnitOption {
  id: string;
  name: string;
  code: string;
  type: string;
  parentId: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  status: string;
  roles?: Array<{ name: string }>;
}

interface CompetentAuthoritiesClientProps {
  userPermissions: string[];
  isSuperAdmin: boolean;
  canManageAuthorities: boolean;
  currentUserId: string;
}

export function CompetentAuthoritiesClient({
  canManageAuthorities,
}: CompetentAuthoritiesClientProps) {
  const [authorities, setAuthorities] = useState<CompetentAuthorityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Admin Units for jurisdiction selector
  const [adminUnits, setAdminUnits] = useState<AdminUnitOption[]>([]);
  // Users for assignment selector
  const [caEligibleUsers, setCaEligibleUsers] = useState<UserOption[]>([]);

  // Create / Edit Authority Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAuthority, setEditingAuthority] = useState<CompetentAuthorityItem | null>(null);
  const [formAuthorityCode, setFormAuthorityCode] = useState('');
  const [formAuthorityName, setFormAuthorityName] = useState('');
  const [formDesignation, setFormDesignation] = useState<string>(COMPETENT_AUTHORITY_DESIGNATIONS[0]);
  const [formAuthorityLevel, setFormAuthorityLevel] = useState<'DISTRICT' | 'REGIONAL' | 'STATE' | 'CENTRAL'>('DISTRICT');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formEffectiveFrom, setFormEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [formEffectiveUntil, setFormEffectiveUntil] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Jurisdiction Management Modal
  const [jurisdictionModalAuthority, setJurisdictionModalAuthority] = useState<CompetentAuthorityItem | null>(null);
  const [authorityJurisdictionsList, setAuthorityJurisdictionsList] = useState<JurisdictionItem[]>([]);
  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [selectedTalukId, setSelectedTalukId] = useState('');
  const [jurEffectiveFrom, setJurEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [jurEffectiveUntil, setJurEffectiveUntil] = useState('');
  const [jurError, setJurError] = useState<string | null>(null);
  const [isAddingJurisdiction, setIsAddingJurisdiction] = useState(false);

  // Officer Assignment Modal
  const [officerModalAuthority, setOfficerModalAuthority] = useState<CompetentAuthorityItem | null>(null);
  const [authorityOfficersList, setAuthorityOfficersList] = useState<AssignedUserItem[]>([]);
  const [isLoadingOfficers, setIsLoadingOfficers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [officerEffectiveFrom, setOfficerEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [officerEffectiveUntil, setOfficerEffectiveUntil] = useState('');
  const [officerError, setOfficerError] = useState<string | null>(null);
  const [isAssigningOfficer, setIsAssigningOfficer] = useState(false);

  // Load authorities
  const fetchAuthorities = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (levelFilter) params.set('level', levelFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('includeJurisdictions', 'true');

      const res = await fetch(`/api/competent-authorities?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load Competent Authorities');
      const json = await res.json();
      if (json.success) {
        setAuthorities(json.data || []);
      } else {
        throw new Error(json.error || 'Failed to load Competent Authorities');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading Competent Authorities');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, levelFilter, statusFilter]);

  useEffect(() => {
    fetchAuthorities();
  }, [fetchAuthorities]);

  // Load admin units and users on mount
  useEffect(() => {
    async function loadAuxData() {
      try {
        const [unitsRes, usersRes] = await Promise.all([
          fetch('/api/administrative-units'),
          fetch('/api/users?limit=100'),
        ]);

        if (unitsRes.ok) {
          const uJson = await unitsRes.json();
          if (uJson.success) setAdminUnits(uJson.data || []);
        }

        if (usersRes.ok) {
          const usJson = await usersRes.json();
          if (usJson.success) setCaEligibleUsers(usJson.data || []);
        }
      } catch {
        // Aux data load failure is non-fatal
      }
    }
    loadAuxData();
  }, []);

  // Filter handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuthorities();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setLevelFilter('');
    setStatusFilter('');
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingAuthority(null);
    setFormAuthorityCode('');
    setFormAuthorityName('');
    setFormDesignation(COMPETENT_AUTHORITY_DESIGNATIONS[0]);
    setFormAuthorityLevel('DISTRICT');
    setFormStatus('ACTIVE');
    setFormEffectiveFrom(new Date().toISOString().split('T')[0]);
    setFormEffectiveUntil('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (auth: CompetentAuthorityItem) => {
    setEditingAuthority(auth);
    setFormAuthorityCode(auth.authorityCode);
    setFormAuthorityName(auth.authorityName);
    setFormDesignation(auth.designation);
    setFormAuthorityLevel(auth.authorityLevel);
    setFormStatus(auth.status);
    setFormEffectiveFrom(auth.effectiveFrom ? auth.effectiveFrom.slice(0, 10) : new Date().toISOString().split('T')[0]);
    setFormEffectiveUntil(auth.effectiveUntil ? auth.effectiveUntil.slice(0, 10) : '');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Submit Create / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingForm(true);
    setFormError(null);

    try {
      if (editingAuthority) {
        // PATCH
        const payload: Record<string, unknown> = {
          authorityName: formAuthorityName.trim(),
          designation: formDesignation,
          authorityLevel: formAuthorityLevel,
          status: formStatus,
          effectiveFrom: formEffectiveFrom,
          effectiveUntil: formEffectiveUntil.trim() ? formEffectiveUntil.trim() : null,
        };

        const res = await fetch(`/api/competent-authorities/${editingAuthority.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to update Competent Authority');
        }

        setSuccessMessage(`Competent Authority "${json.data.authorityName}" updated successfully.`);
      } else {
        // POST
        const payload: Record<string, unknown> = {
          authorityCode: formAuthorityCode.trim(),
          authorityName: formAuthorityName.trim(),
          designation: formDesignation,
          authorityLevel: formAuthorityLevel,
          status: formStatus,
          effectiveFrom: formEffectiveFrom,
          effectiveUntil: formEffectiveUntil.trim() ? formEffectiveUntil.trim() : null,
        };

        const res = await fetch('/api/competent-authorities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to create Competent Authority');
        }

        setSuccessMessage(`Competent Authority "${json.data.authorityName}" created successfully.`);
      }

      setIsFormModalOpen(false);
      await fetchAuthorities();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error saving Competent Authority');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Quick Toggle Status (Activate / Deactivate)
  const handleToggleStatus = async (auth: CompetentAuthorityItem) => {
    const nextStatus = auth.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/competent-authorities/${auth.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to ${nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'} authority`);
      }
      setSuccessMessage(`Competent Authority status updated to ${nextStatus}.`);
      await fetchAuthorities();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to toggle status');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // JURISDICTION MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  const handleOpenJurisdictionModal = async (auth: CompetentAuthorityItem) => {
    setJurisdictionModalAuthority(auth);
    setSelectedStateId('');
    setSelectedDistrictId('');
    setSelectedTalukId('');
    setJurEffectiveFrom(new Date().toISOString().split('T')[0]);
    setJurEffectiveUntil('');
    setJurError(null);
    setIsLoadingJurisdictions(true);

    try {
      const res = await fetch(`/api/competent-authorities/${auth.id}/jurisdictions`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setAuthorityJurisdictionsList(json.data || []);
      }
    } catch {
      setJurError('Failed to load jurisdictions');
    } finally {
      setIsLoadingJurisdictions(false);
    }
  };

  const handleAddJurisdiction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jurisdictionModalAuthority || !selectedStateId) {
      setJurError('Please select at least a State for jurisdiction coverage.');
      return;
    }

    setIsAddingJurisdiction(true);
    setJurError(null);

    try {
      const payload: Record<string, unknown> = {
        stateId: selectedStateId,
        districtId: selectedDistrictId || null,
        talukId: selectedTalukId || null,
        effectiveFrom: jurEffectiveFrom,
        effectiveUntil: jurEffectiveUntil.trim() ? jurEffectiveUntil.trim() : null,
        status: 'ACTIVE',
      };

      const res = await fetch(`/api/competent-authorities/${jurisdictionModalAuthority.id}/jurisdictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add jurisdiction');
      }

      // Reload jurisdictions
      const listRes = await fetch(`/api/competent-authorities/${jurisdictionModalAuthority.id}/jurisdictions`);
      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson.success) setAuthorityJurisdictionsList(listJson.data || []);
      }

      setSelectedDistrictId('');
      setSelectedTalukId('');
      await fetchAuthorities();
    } catch (err: unknown) {
      setJurError(err instanceof Error ? err.message : 'Error adding jurisdiction');
    } finally {
      setIsAddingJurisdiction(false);
    }
  };

  const handleToggleJurisdictionStatus = async (jur: JurisdictionItem) => {
    if (!jurisdictionModalAuthority) return;
    const nextStatus = jur.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(
        `/api/competent-authorities/${jurisdictionModalAuthority.id}/jurisdictions/${jur.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (!res.ok) throw new Error('Failed to update jurisdiction status');

      const listRes = await fetch(`/api/competent-authorities/${jurisdictionModalAuthority.id}/jurisdictions`);
      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson.success) setAuthorityJurisdictionsList(listJson.data || []);
      }
      await fetchAuthorities();
    } catch (err: unknown) {
      setJurError(err instanceof Error ? err.message : 'Failed to update jurisdiction status');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // OFFICER ASSIGNMENT MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  const handleOpenOfficerModal = async (auth: CompetentAuthorityItem) => {
    setOfficerModalAuthority(auth);
    setSelectedUserId('');
    setOfficerEffectiveFrom(new Date().toISOString().split('T')[0]);
    setOfficerEffectiveUntil('');
    setOfficerError(null);
    setIsLoadingOfficers(true);

    try {
      const res = await fetch(`/api/competent-authorities/${auth.id}/users`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setAuthorityOfficersList(json.data || []);
      }
    } catch {
      setOfficerError('Failed to load assigned officers');
    } finally {
      setIsLoadingOfficers(false);
    }
  };

  const handleAssignOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officerModalAuthority || !selectedUserId) {
      setOfficerError('Please select a user to assign.');
      return;
    }

    setIsAssigningOfficer(true);
    setOfficerError(null);

    try {
      const payload: Record<string, unknown> = {
        userId: selectedUserId,
        effectiveFrom: officerEffectiveFrom,
        effectiveUntil: officerEffectiveUntil.trim() ? officerEffectiveUntil.trim() : null,
        status: 'ACTIVE',
      };

      const res = await fetch(`/api/competent-authorities/${officerModalAuthority.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to assign officer');
      }

      // Reload assignments
      const listRes = await fetch(`/api/competent-authorities/${officerModalAuthority.id}/users`);
      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson.success) setAuthorityOfficersList(listJson.data || []);
      }

      setSelectedUserId('');
      await fetchAuthorities();
    } catch (err: unknown) {
      setOfficerError(err instanceof Error ? err.message : 'Error assigning officer');
    } finally {
      setIsAssigningOfficer(false);
    }
  };

  const handleToggleOfficerStatus = async (assign: AssignedUserItem) => {
    if (!officerModalAuthority) return;
    const nextStatus = assign.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(
        `/api/competent-authorities/${officerModalAuthority.id}/users/${assign.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (!res.ok) throw new Error('Failed to update officer assignment status');

      const listRes = await fetch(`/api/competent-authorities/${officerModalAuthority.id}/users`);
      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson.success) setAuthorityOfficersList(listJson.data || []);
      }
      await fetchAuthorities();
    } catch (err: unknown) {
      setOfficerError(err instanceof Error ? err.message : 'Failed to update assignment status');
    }
  };

  // Cascading admin unit options
  const stateUnits = adminUnits.filter((u) => u.type === 'STATE');
  const districtUnits = adminUnits.filter(
    (u) => u.type === 'DISTRICT' && (!selectedStateId || u.parentId === selectedStateId)
  );
  const talukUnits = adminUnits.filter(
    (u) => u.type === 'TALUK' && (!selectedDistrictId || u.parentId === selectedDistrictId)
  );

  return (
    <div className="users-page">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Competent Authorities</h1>
          <p className="page-subtitle">
            Configure statutory Competent Authorities, designations, geographic jurisdictions, and assigned scrutiny officers under the RFCTLARR Act.
          </p>
        </div>
        <div className="page-actions-group">
          <Link href="/competent-authority/reviews" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>⚖</span>
            <span>Review Proposals</span>
          </Link>
          {canManageAuthorities && (
            <button
              onClick={handleOpenCreateModal}
              className="btn-primary"
              id="btn-create-authority"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span>+</span>
              <span>Add Competent Authority</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="alert-success-banner"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '0.875rem',
          }}
        >
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="alert-error-banner" id="ca-error-banner" style={{ marginBottom: '1rem' }}>
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <form onSubmit={handleSearchSubmit} className="users-filter-bar">
        <div className="tree-search-wrapper" style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by code or authority name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
              ✕
            </button>
          )}
        </div>

        <div className="filter-item">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Levels</option>
            <option value="DISTRICT">DISTRICT</option>
            <option value="REGIONAL">REGIONAL</option>
            <option value="STATE">STATE</option>
            <option value="CENTRAL">CENTRAL</option>
          </select>
        </div>

        <div className="filter-item">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </div>

        <button type="submit" className="btn-secondary" id="btn-filter-apply">
          Filter
        </button>
        {(searchQuery || levelFilter || statusFilter) && (
          <button type="button" onClick={handleClearFilters} className="btn-cancel">
            Clear
          </button>
        )}
      </form>

      {/* Authority Table / Card View */}
      {isLoading ? (
        <div className="empty-state-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="spinner-sm" style={{ margin: '0 auto 1rem auto' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading Competent Authorities...</p>
        </div>
      ) : authorities.length === 0 ? (
        <div
          className="empty-state-card"
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            backgroundColor: 'var(--card-bg, #1e293b)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #334155)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏛️</div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            No Competent Authorities Found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            {searchQuery || levelFilter || statusFilter
              ? 'No authorities matched your filter criteria. Try clearing search filters.'
              : 'No Competent Authorities have been configured yet. Add authorities representing statutory designations to enable proposal scrutiny.'}
          </p>
          {canManageAuthorities && (
            <button onClick={handleOpenCreateModal} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>+ Add First Competent Authority</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {authorities.map((auth) => {
            const jurisdictionCount = auth.jurisdictions?.length ?? 0;
            const activeJurisdictions = auth.jurisdictions?.filter((j) => j.status === 'ACTIVE') ?? [];
            const coverageSummary =
              activeJurisdictions.length > 0
                ? activeJurisdictions
                    .map((j) => (j.district?.name ? `${j.state?.name || ''} / ${j.district.name}` : j.state?.name || 'All state'))
                    .join(', ')
                : 'No active jurisdictions configured';

            return (
              <div
                key={auth.id}
                style={{
                  backgroundColor: 'var(--card-bg, #1e293b)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(20, 184, 166, 0.15)',
                          color: '#2dd4bf',
                          fontWeight: 600,
                        }}
                      >
                        {auth.authorityCode}
                      </span>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          padding: '0.125rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          fontWeight: 600,
                        }}
                      >
                        {auth.authorityLevel}
                      </span>
                      <span className={`badge-status ${auth.status.toLowerCase()}`}>
                        {auth.status}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {auth.authorityName}
                    </h2>
                  </div>

                  {/* Actions */}
                  {canManageAuthorities && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleOpenJurisdictionModal(auth)}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        title="Configure geographic coverage"
                      >
                        📍 Jurisdictions ({jurisdictionCount})
                      </button>
                      <button
                        onClick={() => handleOpenOfficerModal(auth)}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        title="Manage assigned Competent Authority officers"
                      >
                        👥 Officers
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(auth)}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                      >
                        ✏ Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(auth)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '4px',
                          border: auth.status === 'ACTIVE' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                          backgroundColor: auth.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: auth.status === 'ACTIVE' ? '#f87171' : '#34d399',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        {auth.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Details grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Statutory Designation</span>
                    <span style={{ fontWeight: 600, color: '#facc15' }}>
                      {auth.designation}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Effective Period</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {auth.effectiveFrom ? auth.effectiveFrom.slice(0, 10) : '—'}
                      {auth.effectiveUntil ? ` to ${auth.effectiveUntil.slice(0, 10)}` : ' (Ongoing)'}
                    </span>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Geographical Coverage</span>
                    <span style={{ color: activeJurisdictions.length > 0 ? 'var(--text-primary)' : '#f87171' }}>
                      {coverageSummary}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Create / Edit Competent Authority Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isFormModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingAuthority ? 'Edit Competent Authority' : 'Create Competent Authority'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="modal-close-btn"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="modal-form">
              {formError && (
                <div className="modal-alert-error" style={{ marginBottom: '1rem' }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="ca-form-code">
                  Authority Code <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <input
                  id="ca-form-code"
                  type="text"
                  required
                  disabled={!!editingAuthority}
                  className="form-input"
                  placeholder="e.g. CA-KA-BLR-DC"
                  value={formAuthorityCode}
                  onChange={(e) => setFormAuthorityCode(e.target.value.toUpperCase())}
                />
                <span className="form-hint">
                  Unique statutory identifier for this authority (e.g. state/district/position code).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ca-form-name">
                  Authority Name <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <input
                  id="ca-form-name"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Office of the Deputy Commissioner, Bengaluru Urban"
                  value={formAuthorityName}
                  onChange={(e) => setFormAuthorityName(e.target.value)}
                />
              </div>

              {/* Statutory Designation Dropdown */}
              <div className="form-group">
                <label className="form-label" htmlFor="ca-form-designation">
                  Statutory Designation <span style={{ color: 'var(--status-danger)' }}>*</span>
                </label>
                <select
                  id="ca-form-designation"
                  required
                  className="form-select"
                  value={formDesignation}
                  onChange={(e) => setFormDesignation(e.target.value)}
                >
                  {COMPETENT_AUTHORITY_DESIGNATIONS.map((desig) => (
                    <option key={desig} value={desig}>
                      {desig}
                    </option>
                  ))}
                  {/* Keep legacy/custom designation selectable if editing existing record */}
                  {editingAuthority &&
                    !COMPETENT_AUTHORITY_DESIGNATIONS.includes(
                      editingAuthority.designation as (typeof COMPETENT_AUTHORITY_DESIGNATIONS)[number]
                    ) && (
                      <option value={editingAuthority.designation}>
                        {editingAuthority.designation} (Legacy)
                      </option>
                    )}
                </select>
                <span className="form-hint">
                  The official government designation represented by this authority. Note: Selecting a designation does not automatically authorize all acquisitions; geographic jurisdiction must also be configured.
                </span>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="ca-form-level">
                    Authority Level <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <select
                    id="ca-form-level"
                    required
                    className="form-select"
                    value={formAuthorityLevel}
                    onChange={(e) => setFormAuthorityLevel(e.target.value as typeof formAuthorityLevel)}
                  >
                    <option value="DISTRICT">DISTRICT</option>
                    <option value="REGIONAL">REGIONAL</option>
                    <option value="STATE">STATE</option>
                    <option value="CENTRAL">CENTRAL</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ca-form-status">
                    Status <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <select
                    id="ca-form-status"
                    required
                    className="form-select"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as typeof formStatus)}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="ca-form-eff-from">
                    Effective From <span style={{ color: 'var(--status-danger)' }}>*</span>
                  </label>
                  <input
                    id="ca-form-eff-from"
                    type="date"
                    required
                    className="form-input"
                    value={formEffectiveFrom}
                    onChange={(e) => setFormEffectiveFrom(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ca-form-eff-until">
                    Effective Until (Optional)
                  </label>
                  <input
                    id="ca-form-eff-until"
                    type="date"
                    className="form-input"
                    value={formEffectiveUntil}
                    onChange={(e) => setFormEffectiveUntil(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="btn-cancel"
                  disabled={isSubmittingForm}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  id="btn-submit-ca-form"
                  disabled={isSubmittingForm}
                >
                  {isSubmittingForm ? 'Saving...' : editingAuthority ? 'Update Authority' : 'Create Authority'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Jurisdiction Management Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {jurisdictionModalAuthority && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Geographical Jurisdictions</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                  {jurisdictionModalAuthority.authorityName} ({jurisdictionModalAuthority.authorityCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJurisdictionModalAuthority(null)}
                className="modal-close-btn"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              {jurError && (
                <div className="modal-alert-error" style={{ marginBottom: '1rem' }}>
                  {jurError}
                </div>
              )}

              {/* Add New Jurisdiction Section */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(20, 184, 166, 0.06)',
                  border: '1px solid rgba(20, 184, 166, 0.3)',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                }}
              >
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2dd4bf', margin: '0 0 0.75rem 0' }}>
                  + Add Geographical Jurisdiction
                </h3>
                <form onSubmit={handleAddJurisdiction} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        State <span style={{ color: 'var(--status-danger)' }}>*</span>
                      </label>
                      <select
                        required
                        className="form-select"
                        value={selectedStateId}
                        onChange={(e) => {
                          setSelectedStateId(e.target.value);
                          setSelectedDistrictId('');
                          setSelectedTalukId('');
                        }}
                      >
                        <option value="">— Select State —</option>
                        {stateUnits.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        District (Optional — blank for entire state)
                      </label>
                      <select
                        className="form-select"
                        value={selectedDistrictId}
                        disabled={!selectedStateId}
                        onChange={(e) => {
                          setSelectedDistrictId(e.target.value);
                          setSelectedTalukId('');
                        }}
                      >
                        <option value="">— Entire State —</option>
                        {districtUnits.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Taluk (Optional — blank for entire district)
                      </label>
                      <select
                        className="form-select"
                        value={selectedTalukId}
                        disabled={!selectedDistrictId}
                        onChange={(e) => setSelectedTalukId(e.target.value)}
                      >
                        <option value="">— Entire District —</option>
                        {talukUnits.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Effective From
                      </label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={jurEffectiveFrom}
                        onChange={(e) => setJurEffectiveFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Effective Until (Optional)
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        value={jurEffectiveUntil}
                        onChange={(e) => setJurEffectiveUntil(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    <button
                      type="submit"
                      disabled={isAddingJurisdiction || !selectedStateId}
                      className="btn-primary"
                      style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
                    >
                      {isAddingJurisdiction ? 'Adding...' : '+ Assign Jurisdiction'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Configured Jurisdictions List */}
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Configured Jurisdictions ({authorityJurisdictionsList.length})
              </h3>

              {isLoadingJurisdictions ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Loading jurisdictions...</p>
              ) : authorityJurisdictionsList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                  No jurisdictions assigned yet. This authority will not appear in eligible authorities for proposal scrutiny until at least one jurisdiction is configured.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {authorityJurisdictionsList.map((jur) => {
                    const coverage = jur.district?.name
                      ? `${jur.state?.name || 'State'} › ${jur.district.name}${jur.taluk?.name ? ` › ${jur.taluk.name}` : ''}`
                      : `${jur.state?.name || 'State'} (Entire State)`;

                    return (
                      <div
                        key={jur.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.625rem 0.875rem',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{coverage}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            Effective: {jur.effectiveFrom ? jur.effectiveFrom.slice(0, 10) : '—'}
                            {jur.effectiveUntil ? ` to ${jur.effectiveUntil.slice(0, 10)}` : ' (Ongoing)'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge-status ${jur.status.toLowerCase()}`}>
                            {jur.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleJurisdictionStatus(jur)}
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              border: jur.status === 'ACTIVE' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                              backgroundColor: jur.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                              color: jur.status === 'ACTIVE' ? '#f87171' : '#34d399',
                              cursor: 'pointer',
                            }}
                          >
                            {jur.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setJurisdictionModalAuthority(null)}
                className="btn-secondary"
                style={{ marginLeft: 'auto' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Officer Assignment Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {officerModalAuthority && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Assigned Officers</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                  {officerModalAuthority.authorityName} ({officerModalAuthority.designation})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOfficerModalAuthority(null)}
                className="modal-close-btn"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              {officerError && (
                <div className="modal-alert-error" style={{ marginBottom: '1rem' }}>
                  {officerError}
                </div>
              )}

              {/* Assign Officer Section */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                }}
              >
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#60a5fa', margin: '0 0 0.75rem 0' }}>
                  + Assign Officer to this Authority
                </h3>
                <form onSubmit={handleAssignOfficer} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Select User <span style={{ color: 'var(--status-danger)' }}>*</span>
                    </label>
                    <select
                      required
                      className="form-select"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                    >
                      <option value="">— Select an active user —</option>
                      {caEligibleUsers
                        .filter((u) => u.status === 'ACTIVE')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                    </select>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                      The user must also hold the COMPETENT_AUTHORITY role to perform reviews on this authority&apos;s behalf.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Effective From
                      </label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={officerEffectiveFrom}
                        onChange={(e) => setOfficerEffectiveFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Effective Until (Optional)
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        value={officerEffectiveUntil}
                        onChange={(e) => setOfficerEffectiveUntil(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    <button
                      type="submit"
                      disabled={isAssigningOfficer || !selectedUserId}
                      className="btn-primary"
                      style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
                    >
                      {isAssigningOfficer ? 'Assigning...' : '+ Assign Officer'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Configured Officers List */}
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Assigned Officers ({authorityOfficersList.length})
              </h3>

              {isLoadingOfficers ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Loading officers...</p>
              ) : authorityOfficersList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                  No officers currently assigned to this authority. Users can also be linked to this authority during user creation or from user details.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {authorityOfficersList.map((assign) => (
                    <div
                      key={assign.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.625rem 0.875rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {assign.user?.name || 'User ID: ' + assign.userId}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {assign.user?.email || '—'}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          Effective: {assign.effectiveFrom ? assign.effectiveFrom.slice(0, 10) : '—'}
                          {assign.effectiveUntil ? ` to ${assign.effectiveUntil.slice(0, 10)}` : ' (Ongoing)'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`badge-status ${assign.status.toLowerCase()}`}>
                          {assign.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleOfficerStatus(assign)}
                          style={{
                            fontSize: '0.6875rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            border: assign.status === 'ACTIVE' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                            backgroundColor: assign.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: assign.status === 'ACTIVE' ? '#f87171' : '#34d399',
                            cursor: 'pointer',
                          }}
                        >
                          {assign.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setOfficerModalAuthority(null)}
                className="btn-secondary"
                style={{ marginLeft: 'auto' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
