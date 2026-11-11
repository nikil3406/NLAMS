'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  VerifiedLandInventoryStatus,
  InventoryParcelSnapshot,
} from '../../../../../db/schema/verified-land-inventories';

interface WorkflowHistoryItem {
  id: string;
  inventoryId: string;
  fromStatus: VerifiedLandInventoryStatus | null;
  toStatus: VerifiedLandInventoryStatus;
  action: string;
  remarks: string | null;
  actorId: string;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  };
}

interface InventoryDetailData {
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
  preparer: {
    id: string;
    name: string;
    email: string;
  };
  submitter: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewer: {
    id: string;
    name: string;
    email: string;
  } | null;
  acquisitionCase: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
    projectId: string;
    project: {
      id: string;
      projectCode: string;
      name: string;
      administrativeUnitId: string;
      administrativeUnit: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  snapshots: InventoryParcelSnapshot[];
  workflowHistory: WorkflowHistoryItem[];
}

interface VersionHistoryItem {
  id: string;
  caseId: string;
  versionNumber: number;
  status: VerifiedLandInventoryStatus;
  totalParcelCount: number;
  aggregateAffectedArea: string;
  areaUnit: string;
  generatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewRemarks: string | null;
  preparer: {
    id: string;
    name: string;
    email: string;
  };
  reviewer: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface InventoryDetailClientProps {
  inventoryId: string;
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

export function InventoryDetailClient({
  inventoryId,
  userRoles,
}: InventoryDetailClientProps) {
  const router = useRouter();
  const isLandOfficer = userRoles.includes('LAND_OFFICER');
  const isMinistryAdmin = userRoles.includes('MINISTRY_ADMIN');

  const [inventory, setInventory] = useState<InventoryDetailData | null>(null);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inspect Snapshot Modal
  const [inspectedSnapshot, setInspectedSnapshot] = useState<InventoryParcelSnapshot | null>(null);

  // Submit Draft Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitRemarks, setSubmitRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Revise Modal
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseRemarks, setReviseRemarks] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  // Ministry Decision Modal
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<'APPROVE' | 'REQUEST_CORRECTIONS' | 'REJECT' | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [isProcessingDecision, setIsProcessingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Fetch Inventory Details and Version History
  const loadDetails = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/verified-land-inventories/${inventoryId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Verified land inventory not found.');
        }
        if (res.status === 403) {
          throw new Error('You do not have permission to view this inventory.');
        }
        throw new Error('Failed to load inventory details.');
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load inventory');
      }

      const data: InventoryDetailData = json.data;
      setInventory(data);

      // Fetch all versions for this acquisition case
      if (data.caseId) {
        const vRes = await fetch(`/api/acquisition-cases/${data.caseId}/inventories`);
        if (vRes.ok) {
          const vJson = await vRes.json();
          if (vJson.success) {
            setVersionHistory(vJson.data || []);
          }
        }
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while loading inventory details'
      );
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // Handle Submit Draft
  const handleSubmitInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventory) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/verified-land-inventories/${inventory.id}/submit`, {
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

      setShowSubmitModal(false);
      setSuccessMessage('Inventory submitted for Ministry review successfully.');
      loadDetails();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Error submitting inventory'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revise (after CORRECTION_REQUESTED)
  const handleReviseInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventory) return;

    setIsRevising(true);
    setReviseError(null);

    try {
      const res = await fetch(`/api/acquisition-cases/${inventory.caseId}/inventories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remarks: reviseRemarks.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate revised inventory version.');
      }

      setShowReviseModal(false);
      const newVersion = data.data.versionNumber ?? data.data.version ?? 2;
      setSuccessMessage(`Revised Version v${newVersion} created successfully.`);
      // Navigate to the newly generated version
      router.push(`/verified-land-inventories/${data.data.id}`);
    } catch (err: unknown) {
      setReviseError(
        err instanceof Error ? err.message : 'Error generating revised inventory'
      );
    } finally {
      setIsRevising(false);
    }
  };

  // Handle Ministry Decision (Approve / Request Corrections / Reject)
  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventory || !decisionType) return;
    if (
      (decisionType === 'REQUEST_CORRECTIONS' || decisionType === 'REJECT') &&
      !decisionRemarks.trim()
    ) {
      setDecisionError('Remarks are required for this action.');
      return;
    }
    setIsProcessingDecision(true);
    setDecisionError(null);
    try {
      const res = await fetch(`/api/verified-land-inventories/${inventory.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decisionType,
          remarks: decisionRemarks.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Decision failed');
      setShowDecisionModal(false);
      setDecisionRemarks('');
      setDecisionType(null);
      const label =
        decisionType === 'APPROVE'
          ? 'approved'
          : decisionType === 'REJECT'
          ? 'rejected'
          : 'returned for corrections';
      setSuccessMessage(`Inventory ${label} successfully.`);
      loadDetails();
    } catch (err: unknown) {
      setDecisionError(err instanceof Error ? err.message : 'Error processing decision');
    } finally {
      setIsProcessingDecision(false);
    }
  };

  if (isLoading) {
    return (
      <div className="users-page">
        <div className="empty-state-card" style={{ marginTop: '2rem' }}>
          <span className="spinner-sm" />
          <span>Loading verified land inventory details and immutable parcel snapshots...</span>
        </div>
      </div>
    );
  }

  if (errorMessage || !inventory) {
    return (
      <div className="users-page">
        <div className="page-header-row">
          <div>
            <Link
              href="/verified-land-inventories"
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}
            >
              ← Back to Inventories
            </Link>
            <h1 className="page-title">Verified Land Inventory</h1>
          </div>
        </div>
        <div className="alert-banner-error" role="alert">
          <span>{errorMessage || 'Failed to load inventory'}</span>
        </div>
      </div>
    );
  }

  const statusConfig =
    INVENTORY_STATUS_CONFIG[inventory.status] || {
      bg: 'rgba(148, 163, 184, 0.1)',
      color: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.2)',
      label: inventory.status,
    };

  return (
    <div className="users-page">
      {/* Navigation Breadcrumb & Back Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <Link
          href="/verified-land-inventories"
          className="btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }}
        >
          ← All Inventories
        </Link>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {inventory.acquisitionCase.caseReference}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
          Version {inventory.versionNumber}
        </span>
      </div>

      {/* Page Header */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Inventory Version {inventory.versionNumber}
            </h1>
            <span
              className="cell-status-pill"
              style={{
                background: statusConfig.bg,
                color: statusConfig.color,
                borderColor: statusConfig.border,
                fontSize: '0.8125rem',
                padding: '0.25rem 0.75rem',
              }}
            >
              {statusConfig.label}
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            {inventory.acquisitionCase.title} • {inventory.acquisitionCase.project.name} (
            {inventory.acquisitionCase.project.projectCode})
          </p>
        </div>

        {/* Action Buttons */}
        <div className="page-actions-group">
          {isLandOfficer && inventory.status === 'DRAFT' && (
            <button
              type="button"
              className="btn-primary"
              id="btn-submit-draft-inventory"
              onClick={() => {
                setShowSubmitModal(true);
                setSubmitRemarks('');
                setSubmitError(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>Submit for Ministry Review</span>
            </button>
          )}

          {isLandOfficer && inventory.status === 'CORRECTION_REQUESTED' && (
            <button
              type="button"
              className="btn-primary"
              id="btn-revise-inventory"
              style={{ background: '#f59e0b', borderColor: '#d97706' }}
              onClick={() => {
                setShowReviseModal(true);
                setReviseRemarks('');
                setReviseError(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Generate Revised Version</span>
            </button>
          )}

          {isMinistryAdmin && (inventory.status === 'SUBMITTED' || inventory.status === 'UNDER_REVIEW') && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                id="btn-approve-inventory"
                onClick={() => {
                  setDecisionType('APPROVE');
                  setDecisionRemarks('');
                  setDecisionError(null);
                  setShowDecisionModal(true);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Approve Inventory</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-request-corrections"
                style={{ borderColor: '#d97706', color: '#fbbf24' }}
                onClick={() => {
                  setDecisionType('REQUEST_CORRECTIONS');
                  setDecisionRemarks('');
                  setDecisionError(null);
                  setShowDecisionModal(true);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Request Corrections</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-reject-inventory"
                style={{ borderColor: '#dc2626', color: '#f87171' }}
                onClick={() => {
                  setDecisionType('REJECT');
                  setDecisionRemarks('');
                  setDecisionError(null);
                  setShowDecisionModal(true);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Reject</span>
              </button>
            </div>
          )}
          {isMinistryAdmin && inventory.status === 'APPROVED' && (
            <div
              style={{
                fontSize: '0.8125rem',
                color: '#34d399',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approved — Eligible for Acquisition Proposal Preparation
            </div>
          )}
          {isMinistryAdmin && !['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(inventory.status) && (
            <div
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
              }}
            >
              Ministry Verification View (Read-only)
            </div>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="alert-banner-success"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Approved Notice */}
      {inventory.status === 'APPROVED' && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" style={{ flexShrink: 0, marginTop: '0.1rem' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, color: '#34d399', marginBottom: '0.25rem' }}>
              Inventory Approved
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
              This inventory has been officially approved by the Ministry Administrator
              {inventory.reviewer ? ` (${inventory.reviewer.name})` : ''}.
              It is permanently immutable and is now eligible for acquisition proposal preparation.
            </p>
          </div>
        </div>
      )}

      {/* Correction Notice if Status is CORRECTION_REQUESTED */}
      {inventory.status === 'CORRECTION_REQUESTED' && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#fbbf24', marginBottom: '0.35rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Ministry Correction Requested</span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
            The Ministry Administrator has returned this inventory version for corrections:
          </p>
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.2)',
              fontSize: '0.875rem',
              fontStyle: 'italic',
            }}
          >
            &quot;{inventory.reviewRemarks || 'No specific remarks provided.'}&quot;
          </div>
        </div>
      )}

      {/* Inventory Overview Card Grid */}
      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
          Inventory Overview
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Card 1: Identification */}
          <div className="metric-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Identification
            </span>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Inventory ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-all' }}>
                {inventory.id}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Case Reference</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                {inventory.acquisitionCase.caseReference}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Project</div>
              <div style={{ fontSize: '0.875rem' }}>
                {inventory.acquisitionCase.project.name} ({inventory.acquisitionCase.project.projectCode})
              </div>
            </div>
          </div>

          {/* Card 2: Area & Parcels */}
          <div className="metric-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quantities & Aggregates
            </span>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Total Parcels</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {inventory.totalParcelCount}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recorded Area</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {inventory.aggregateRecordedArea}{' '}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inventory.areaUnit}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Affected Area</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#38bdf8' }}>
                  {inventory.aggregateAffectedArea}{' '}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inventory.areaUnit}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Officers & Lifecycle */}
          <div className="metric-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Governance & Timestamps
            </span>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Prepared By</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{inventory.preparer.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Generated: {new Date(inventory.generatedAt).toLocaleString()}
              </div>
            </div>
            {inventory.submitter && (
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Submitted By</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{inventory.submitter.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {inventory.submittedAt ? new Date(inventory.submittedAt).toLocaleString() : '—'}
                </div>
              </div>
            )}
            {inventory.reviewer && (
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Reviewed By</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{inventory.reviewer.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {inventory.reviewedAt ? new Date(inventory.reviewedAt).toLocaleString() : '—'}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Parcel Snapshot Table */}
      <section style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Immutable Parcel Snapshots ({inventory.snapshots.length})
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Preserved snapshot of all verified parcels at the moment of version {inventory.versionNumber} generation.
            </p>
          </div>
        </div>

        <div className="users-table-container">
          {inventory.snapshots.length === 0 ? (
            <div className="empty-state-card">
              <span>No parcel snapshots recorded in this inventory version.</span>
            </div>
          ) : (
            <table className="users-table" id="parcel-snapshots-table">
              <thead>
                <tr>
                  <th>Parcel ID</th>
                  <th>Village</th>
                  <th>Survey / Hissa</th>
                  <th>Recorded Area</th>
                  <th>Affected Area</th>
                  <th>Field Measured</th>
                  <th>Verification Date</th>
                  <th>Report Ref</th>
                  <th>Discrepancy Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.snapshots.map((snap) => {
                  const hasDiscrepancy = snap.discrepancyDetails && snap.discrepancyDetails.length > 0;
                  const discrepancyLabel = hasDiscrepancy ? 'Resolved' : 'None';

                  return (
                    <tr key={snap.id} id={`snapshot-row-${snap.id}`}>
                      <td>
                        <span
                          style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-secondary)' }}
                          title={snap.parcelId}
                        >
                          {snap.parcelId.substring(0, 8)}…
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{snap.village}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {snap.taluk}, {snap.district}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{snap.surveyNumber}</span>
                        {snap.hissaNumber ? ` / ${snap.hissaNumber}` : ''}
                      </td>
                      <td>
                        {snap.recordedArea}{' '}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{snap.recordedAreaUnit}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{snap.proposedAffectedArea}</span>{' '}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{snap.proposedAffectedAreaUnit}</span>
                      </td>
                      <td>
                        {snap.fieldMeasuredArea ? (
                          <span>
                            {snap.fieldMeasuredArea}{' '}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {snap.fieldMeasuredAreaUnit || snap.recordedAreaUnit}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Not measured</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem' }}>
                          {snap.verificationDate ? new Date(snap.verificationDate).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                          title={snap.acceptedReportId || undefined}
                        >
                          {snap.acceptedReportId ? snap.acceptedReportId.substring(0, 8) + '…' : '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className="cell-status-pill"
                          style={{
                            background: hasDiscrepancy
                              ? 'rgba(16, 185, 129, 0.12)'
                              : 'rgba(148, 163, 184, 0.12)',
                            color: hasDiscrepancy ? '#34d399' : '#94a3b8',
                            borderColor: 'transparent',
                            fontSize: '0.75rem',
                          }}
                        >
                          {discrepancyLabel}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setInspectedSnapshot(snap)}
                          id={`btn-inspect-snapshot-${snap.id}`}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Version History Section */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
          Inventory Version History
        </h2>
        <div className="users-table-container">
          <table className="users-table" id="version-history-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Parcels</th>
                <th>Affected Area</th>
                <th>Created Date</th>
                <th>Prepared By</th>
                <th>Submission / Review Dates</th>
                <th>Review Remarks</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {versionHistory.map((v) => {
                const vConfig =
                  INVENTORY_STATUS_CONFIG[v.status] || {
                    bg: 'rgba(148, 163, 184, 0.1)',
                    color: '#94a3b8',
                    border: 'rgba(148, 163, 184, 0.2)',
                    label: v.status,
                  };
                const isCurrent = v.id === inventory.id;

                return (
                  <tr
                    key={v.id}
                    style={{
                      background: isCurrent ? 'rgba(59, 130, 246, 0.05)' : undefined,
                    }}
                  >
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: isCurrent ? 'var(--accent-secondary)' : 'var(--text-primary)',
                        }}
                      >
                        v{v.versionNumber} {isCurrent && '(Current)'}
                      </span>
                    </td>
                    <td>
                      <span
                        className="cell-status-pill"
                        style={{
                          background: vConfig.bg,
                          color: vConfig.color,
                          borderColor: vConfig.border,
                          fontSize: '0.75rem',
                        }}
                      >
                        {vConfig.label}
                      </span>
                    </td>
                    <td>{v.totalParcelCount}</td>
                    <td>
                      {v.aggregateAffectedArea} {v.areaUnit}
                    </td>
                    <td>{new Date(v.generatedAt).toLocaleDateString()}</td>
                    <td>{v.preparer?.name || '—'}</td>
                    <td>
                      <div style={{ fontSize: '0.75rem' }}>
                        Sub: {v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Rev: {v.reviewedAt ? new Date(v.reviewedAt).toLocaleDateString() : '—'}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          maxWidth: '220px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                        }}
                        title={v.reviewRemarks || undefined}
                      >
                        {v.reviewRemarks || '—'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isCurrent ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active</span>
                      ) : (
                        <Link
                          href={`/verified-land-inventories/${v.id}`}
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          View v{v.versionNumber}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Workflow Audit Trail */}
      {inventory.workflowHistory && inventory.workflowHistory.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Workflow Audit History
          </h2>
          <div className="users-table-container">
            <table className="users-table" id="workflow-history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Status Transition</th>
                  <th>Actor</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {inventory.workflowHistory.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{h.action}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {h.fromStatus || 'None'} →
                      </span>{' '}
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{h.toStatus}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{h.actor.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.actor.email}</div>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {h.remarks || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Inspect Parcel Snapshot Modal */}
      {inspectedSnapshot && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '640px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Inspect Parcel Snapshot</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInspectedSnapshot(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  fontSize: '0.8125rem',
                  color: '#60a5fa',
                }}
              >
                <strong>Immutable Snapshot Record:</strong> This data reflects the immutable state captured when
                Inventory Version {inventory.versionNumber} was generated.
              </div>

              {/* Grid of Attributes */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  fontSize: '0.8125rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Original Parcel ID</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {inspectedSnapshot.parcelId}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Snapshot ID</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {inspectedSnapshot.id}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Locality</div>
                  <div>
                    {inspectedSnapshot.village}, {inspectedSnapshot.taluk}, {inspectedSnapshot.district},{' '}
                    {inspectedSnapshot.state}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Survey / Hissa</div>
                  <div style={{ fontWeight: 600 }}>
                    {inspectedSnapshot.surveyNumber}
                    {inspectedSnapshot.hissaNumber ? ` / ${inspectedSnapshot.hissaNumber}` : ' (No hissa)'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Land Record Reference</div>
                  <div>{inspectedSnapshot.landRecordReference || 'Not provided'}</div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Accepted Field Report</div>
                  <div style={{ fontFamily: 'monospace' }}>
                    {inspectedSnapshot.acceptedReportId || 'None'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Recorded Area</div>
                  <div style={{ fontWeight: 600 }}>
                    {inspectedSnapshot.recordedArea} {inspectedSnapshot.recordedAreaUnit}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Proposed Affected Area</div>
                  <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                    {inspectedSnapshot.proposedAffectedArea} {inspectedSnapshot.proposedAffectedAreaUnit}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Field-Measured Area</div>
                  <div>
                    {inspectedSnapshot.fieldMeasuredArea
                      ? `${inspectedSnapshot.fieldMeasuredArea} ${inspectedSnapshot.fieldMeasuredAreaUnit || inspectedSnapshot.recordedAreaUnit}`
                      : 'Unavailable / Not measured'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Verification Date</div>
                  <div>
                    {inspectedSnapshot.verificationDate
                      ? new Date(inspectedSnapshot.verificationDate).toLocaleDateString()
                      : 'Not recorded'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Discrepancy Resolution</div>
                  <div>
                    <span
                      className="cell-status-pill"
                      style={{
                        background:
                          inspectedSnapshot.discrepancyDetails && inspectedSnapshot.discrepancyDetails.length > 0
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(148, 163, 184, 0.12)',
                        color:
                          inspectedSnapshot.discrepancyDetails && inspectedSnapshot.discrepancyDetails.length > 0
                            ? '#34d399'
                            : '#94a3b8',
                        borderColor: 'transparent',
                        fontSize: '0.75rem',
                      }}
                    >
                      {inspectedSnapshot.discrepancyDetails && inspectedSnapshot.discrepancyDetails.length > 0
                        ? 'Resolved'
                        : 'No Discrepancy'}
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Discrepancy References</div>
                  <div>
                    {inspectedSnapshot.discrepancyDetails && inspectedSnapshot.discrepancyDetails.length > 0
                      ? inspectedSnapshot.discrepancyDetails.map((d) => d.discrepancyId).join(', ')
                      : 'None'}
                  </div>
                </div>
              </div>

              {/* Geometry Section */}
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  Spatial Geometry
                </div>
                {inspectedSnapshot.geometry ? (
                  <div
                    style={{
                      padding: '0.5rem',
                      borderRadius: '6px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      maxHeight: '100px',
                      overflowY: 'auto',
                    }}
                  >
                    {typeof inspectedSnapshot.geometry === 'string'
                      ? inspectedSnapshot.geometry
                      : JSON.stringify(inspectedSnapshot.geometry)}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px dashed var(--border-color)',
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No geometry captured on parcel record.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setInspectedSnapshot(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Draft Modal */}
      {showSubmitModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Submit Inventory for Ministry Review</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSubmitting && setShowSubmitModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitInventory}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  You are about to submit{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Inventory Version {inventory.versionNumber}
                  </strong>{' '}
                  containing {inventory.totalParcelCount} verified parcels.
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
                    htmlFor="detail-submit-remarks"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    Submission Remarks (Optional)
                  </label>
                  <textarea
                    id="detail-submit-remarks"
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
                  onClick={() => setShowSubmitModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                  id="btn-confirm-detail-submit"
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

      {/* Ministry Decision Modal */}
      {showDecisionModal && decisionType && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {decisionType === 'APPROVE'
                  ? 'Approve Inventory'
                  : decisionType === 'REQUEST_CORRECTIONS'
                  ? 'Request Corrections'
                  : 'Reject Inventory'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isProcessingDecision && setShowDecisionModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDecision}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Summary */}
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Inventory under review</div>
                  <div style={{ fontWeight: 600 }}>
                    {inventory.acquisitionCase.caseReference} — v{inventory.versionNumber}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {inventory.totalParcelCount} parcels · {inventory.aggregateAffectedArea} {inventory.areaUnit} affected area
                  </div>
                </div>

                {/* Warning specific to decision */}
                {decisionType === 'APPROVE' && (
                  <div
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      fontSize: '0.8125rem',
                      color: '#34d399',
                    }}
                  >
                    <strong>Approval Notice:</strong> Approving this inventory makes it permanently
                    immutable and marks it as eligible for acquisition proposal preparation.
                  </div>
                )}
                {decisionType === 'REQUEST_CORRECTIONS' && (
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
                    <strong>Notice:</strong> This will return the inventory to the Land Officer for revision.
                    Your remarks must clearly explain what needs to be corrected.
                  </div>
                )}
                {decisionType === 'REJECT' && (
                  <div
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      fontSize: '0.8125rem',
                      color: '#f87171',
                    }}
                  >
                    <strong>Warning:</strong> Rejecting this inventory is a final administrative decision.
                    Mandatory remarks must justify the rejection.
                  </div>
                )}

                {decisionError && (
                  <div className="alert-banner-error" style={{ fontSize: '0.8125rem' }}>
                    <span>{decisionError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="decision-remarks"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    {decisionType === 'APPROVE'
                      ? 'Approval Remarks (Optional)'
                      : <>Remarks <span style={{ color: '#f87171' }}>*</span> (Required)</>}
                  </label>
                  <textarea
                    id="decision-remarks"
                    required={decisionType !== 'APPROVE'}
                    rows={4}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    className="search-input"
                    style={{ width: '100%', resize: 'vertical' }}
                    placeholder={
                      decisionType === 'APPROVE'
                        ? 'Optional approval notes or observations...'
                        : 'Required: explain clearly the reason for this decision...'
                    }
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={isProcessingDecision}
                  onClick={() => setShowDecisionModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isProcessingDecision}
                  id="btn-confirm-decision"
                  style={
                    decisionType === 'REJECT'
                      ? { background: '#dc2626', borderColor: '#b91c1c' }
                      : decisionType === 'REQUEST_CORRECTIONS'
                      ? { background: '#d97706', borderColor: '#b45309' }
                      : {}
                  }
                >
                  {isProcessingDecision ? (
                    <>
                      <span className="spinner-sm" />
                      <span>Processing...</span>
                    </>
                  ) : decisionType === 'APPROVE' ? (
                    'Confirm Approval'
                  ) : decisionType === 'REQUEST_CORRECTIONS' ? (
                    'Send Correction Request'
                  ) : (
                    'Confirm Rejection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revise Modal */}
      {showReviseModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '520px', width: '100%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Generate Revised Inventory Version</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isRevising && setShowReviseModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReviseInventory}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Generate a revised draft inventory (Version {inventory.versionNumber + 1}) incorporating corrections.
                  The previous version remains intact in version history.
                </p>

                {reviseError && (
                  <div className="alert-banner-error" style={{ fontSize: '0.8125rem' }}>
                    <span>{reviseError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="detail-revise-remarks"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}
                  >
                    Revision Remarks (Optional)
                  </label>
                  <textarea
                    id="detail-revise-remarks"
                    rows={3}
                    value={reviseRemarks}
                    onChange={(e) => setReviseRemarks(e.target.value)}
                    placeholder="Enter notes on corrections addressed in this new version..."
                    className="search-input"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={isRevising}
                  onClick={() => setShowReviseModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isRevising}
                  id="btn-confirm-revise"
                >
                  {isRevising ? (
                    <>
                      <span className="spinner-sm" />
                      <span>Generating Revision...</span>
                    </>
                  ) : (
                    <span>Generate Revision</span>
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
