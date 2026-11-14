'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ProposalWithDetails } from '../../../../repositories/acquisition-proposal.repository';
import type { ProposalStatus } from '../../../../../db/schema/acquisition-proposals';
import type { ProposalValidationReport } from '../../../../services/acquisition-proposals/proposal-validation.service';

interface ProposalDetailClientProps {
  proposalId: string;
  currentUserId: string;
  userRoles: string[];
  isSuperAdmin: boolean;
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
    label: '✓ Approved',
  },
  REJECTED: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    label: 'Rejected',
  },
};

export function ProposalDetailClient({
  proposalId,
  currentUserId,
  userRoles,
}: ProposalDetailClientProps) {
  const isAgencyUser =
    userRoles.includes('IMPLEMENTING_AGENCY') ||
    userRoles.includes('PROJECT_OFFICER');

  const [proposal, setProposal] = useState<ProposalWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Versions state
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<any | null>(null);

  // Validation state
  const [validationReport, setValidationReport] =
    useState<ProposalValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Submission state
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitRemarks, setSubmitRemarks] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Correction "Make Changes" state
  const [showMakeChangesModal, setShowMakeChangesModal] = useState(false);
  const [isMakingChanges, setIsMakingChanges] = useState(false);
  const [makeChangesRemarks, setMakeChangesRemarks] = useState('');
  const [makeChangesError, setMakeChangesError] = useState<string | null>(null);

  const fetchProposal = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/acquisition-proposals/${proposalId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Acquisition proposal not found.');
        }
        if (res.status === 403) {
          throw new Error('You do not have access to this proposal.');
        }
        throw new Error('Failed to load proposal details.');
      }

      const json = await res.json();
      if (json.success) {
        setProposal(json.data);
        setViewingVersion(json.data.currentVersion);
      } else {
        throw new Error(json.error || 'Failed to load proposal.');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'An error occurred while loading proposal.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [proposalId]);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/acquisition-proposals/${proposalId}/versions`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setVersionsList(json.data);
        }
      }
    } catch {
      // non-critical
    }
  }, [proposalId]);

  useEffect(() => {
    fetchProposal();
    fetchVersions();
  }, [fetchProposal, fetchVersions]);

  // Run Rule-Based Validation
  const handleRunValidation = async () => {
    setIsValidating(true);
    setValidationError(null);
    setShowValidationModal(true);
    try {
      const res = await fetch(`/api/acquisition-proposals/${proposalId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: viewingVersion?.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Validation failed to execute');
      }

      setValidationReport(json.data);
    } catch (err: unknown) {
      setValidationError(
        err instanceof Error ? err.message : 'Error executing validation'
      );
    } finally {
      setIsValidating(false);
    }
  };

  // Submit Proposal
  const handleSubmitProposal = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/acquisition-proposals/${proposalId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: submitRemarks }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit proposal');
      }

      setSubmitSuccess(true);
      setTimeout(() => {
        setShowSubmitModal(false);
        setSubmitSuccess(false);
        fetchProposal();
        fetchVersions();
      }, 1200);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to submit proposal'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Make Changes (Create Next Version for CORRECTION_REQUESTED)
  const handleMakeChanges = async () => {
    setIsMakingChanges(true);
    setMakeChangesError(null);
    try {
      const res = await fetch(`/api/acquisition-proposals/${proposalId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: makeChangesRemarks }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create new version');
      }

      setShowMakeChangesModal(false);
      await fetchProposal();
      await fetchVersions();
    } catch (err: unknown) {
      setMakeChangesError(
        err instanceof Error ? err.message : 'Failed to create new version'
      );
    } finally {
      setIsMakingChanges(false);
    }
  };

  // Switch displayed version
  const handleSelectVersion = (versionItem: any) => {
    setSelectedVersionId(versionItem.id);
    setViewingVersion(versionItem);
  };

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          Loading acquisition proposal details...
        </p>
      </div>
    );
  }

  if (errorMessage || !proposal) {
    return (
      <div
        className="container"
        style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}
      >
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.375rem',
            color: '#f87171',
            marginBottom: '1rem',
          }}
        >
          {errorMessage || 'Proposal not found.'}
        </div>
        <Link href="/acquisition-proposals" className="btn btn-secondary">
          ← Back to Proposals
        </Link>
      </div>
    );
  }

  const badge =
    STATUS_BADGE_STYLES[proposal.currentStatus] || STATUS_BADGE_STYLES.DRAFT;
  const isCreator =
    proposal.createdBy === currentUserId ||
    proposal.currentVersion?.createdBy === currentUserId;
  const isDraft = proposal.currentStatus === 'DRAFT';
  const isCorrectionRequested =
    proposal.currentStatus === 'CORRECTION_REQUESTED';
  const isViewingCurrent =
    !selectedVersionId || selectedVersionId === proposal.currentVersionId;

  const version = viewingVersion || proposal.currentVersion;

  return (
    <div
      className="container"
      style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      {/* Top Navigation & Action Controls */}
      <div
        style={{
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            href="/acquisition-proposals"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.8125rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            ← Back to Proposals
          </Link>
          <Link
            href="/competent-authority/reviews"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.8125rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            ⚖ Authority Reviews
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Validate Proposal Action */}
          <button
            onClick={handleRunValidation}
            id="validate-proposal-btn"
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              fontSize: '0.8125rem',
              borderRadius: '0.375rem',
              fontWeight: 600,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Validate Proposal
          </button>

          {/* Edit Draft Action (only if DRAFT and creator) */}
          {isDraft && isCreator && isViewingCurrent && (
            <Link
              href={`/acquisition-proposals/${proposal.id}/edit`}
              id="edit-proposal-btn"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                textDecoration: 'none',
                padding: '0.45rem 0.9rem',
                fontSize: '0.8125rem',
                borderRadius: '0.375rem',
                fontWeight: 600,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Draft
            </Link>
          )}

          {/* Submit Proposal Action (only if DRAFT and agency user) */}
          {isDraft && isAgencyUser && (
            <button
              onClick={() => {
                setSubmitError(null);
                setShowSubmitModal(true);
              }}
              id="submit-proposal-btn"
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1rem',
                fontSize: '0.8125rem',
                borderRadius: '0.375rem',
                fontWeight: 600,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Submit Proposal
            </button>
          )}

          {/* Make Changes Action (only if CORRECTION_REQUESTED and agency user) */}
          {isCorrectionRequested && isAgencyUser && (
            <button
              onClick={() => {
                setMakeChangesError(null);
                setShowMakeChangesModal(true);
              }}
              id="make-changes-btn"
              className="btn btn-warning"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1rem',
                fontSize: '0.8125rem',
                borderRadius: '0.375rem',
                fontWeight: 600,
                backgroundColor: 'rgba(234, 88, 12, 0.9)',
                color: '#fff',
                border: 'none',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Make Changes
            </button>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          marginBottom: '1.5rem',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '0.5rem',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {proposal.proposalNumber}
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
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
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  padding: '0.15rem 0.5rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '0.25rem',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
              >
                Current: Version {proposal.currentVersionNumber}
              </span>
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                margin: 0,
              }}
            >
              Created on {new Date(proposal.createdAt).toLocaleDateString()} by{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {proposal.creator.name}
              </strong>{' '}
              ({proposal.creator.email})
            </p>
          </div>

          <div
            style={{
              textAlign: 'right',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              Last Updated: {new Date(proposal.updatedAt).toLocaleString()}
            </div>
            <div>
              Implementing Agency:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {proposal.implementingAgency.name}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Context Information */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Project Card */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
            }}
          >
            Infrastructure Project
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Project Name
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {proposal.project.name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Code
                </span>
                <span
                  style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}
                >
                  {proposal.project.projectCode}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Type
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {proposal.project.projectType}
                </span>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Administrative Jurisdiction
              </span>
              <span style={{ color: 'var(--text-primary)' }}>
                {proposal.project.administrativeUnit.name} (
                {proposal.project.administrativeUnit.code})
              </span>
            </div>
          </div>
        </div>

        {/* Acquisition Case Card */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
            }}
          >
            Acquisition Case
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Case Reference
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {proposal.acquisitionCase.caseReference}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Case Title
              </span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {proposal.acquisitionCase.title}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Status
              </span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>
                {proposal.acquisitionCase.status}
              </span>
            </div>
          </div>
        </div>

        {/* Linked Verified Land Inventory Card */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
            }}
          >
            <h3
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Linked Verified Land Inventory
            </h3>
            <span
              style={{
                fontSize: '0.6875rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '0.25rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontWeight: 600,
              }}
            >
              Version {proposal.linkedInventory.versionNumber} (Approved)
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.8125rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Total Parcels
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {proposal.linkedInventory.totalParcelCount} parcels
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Affected Area
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {proposal.linkedInventory.aggregateAffectedArea}{' '}
                  {proposal.linkedInventory.areaUnit}
                </span>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Approval Date
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {proposal.linkedInventory.reviewedAt
                  ? new Date(
                      proposal.linkedInventory.reviewedAt
                    ).toLocaleDateString()
                  : 'Approved'}
              </span>
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                marginTop: '0.25rem',
              }}
            >
              ✓ Immutable verified snapshot preserved.
            </div>
          </div>
        </div>

        {/* Competent Authority Card */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
            }}
          >
            <h3
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Competent Authority
            </h3>
            {proposal.selectedAuthority ? (
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '0.25rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  fontWeight: 600,
                }}
              >
                {proposal.selectedAuthority.authorityLevel}
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.6875rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '0.25rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  fontWeight: 600,
                }}
              >
                Not Assigned
              </span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.8125rem',
            }}
          >
            {proposal.selectedAuthority ? (
              <>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                    Authority Name
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {proposal.selectedAuthority.authorityName}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                    Designation
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {proposal.selectedAuthority.designation}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                      Code
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {proposal.selectedAuthority.authorityCode}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                      Status
                    </span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>
                      {proposal.selectedAuthority.status}
                    </span>
                  </div>
                </div>
                {proposal.selectedAuthority.assignment && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Assigned on {new Date(proposal.selectedAuthority.assignment.assignedAt).toLocaleDateString()}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                No Competent Authority has been assigned to this proposal draft. You can assign one by editing the draft.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version Navigation / Selector Banner */}
      {versionsList.length > 1 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              Versions ({versionsList.length}):
            </span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {versionsList.map((v) => {
                const isSelected = version?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVersion(v)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '0.25rem',
                      border: isSelected
                        ? '1px solid #60a5fa'
                        : '1px solid var(--border-color)',
                      backgroundColor: isSelected
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#60a5fa' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : 500,
                    }}
                  >
                    v{v.versionNumber} ({v.status})
                  </button>
                );
              })}
            </div>
          </div>

          {!isViewingCurrent && (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#fbbf24',
                fontWeight: 500,
              }}
            >
              Viewing historical Version {version?.versionNumber} (Read-only)
            </span>
          )}
        </div>
      )}

      {/* Substantive Proposal Content */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          marginBottom: '1.5rem',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '0.5rem',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Proposal Content (Version {version?.versionNumber ?? 1} —{' '}
            {version?.status})
          </h2>

          {version?.submittedAt && (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#60a5fa',
                fontWeight: 500,
              }}
            >
              Submitted on{' '}
              {new Date(version.submittedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {version ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            <div>
              <h4
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Acquisition Justification
              </h4>
              <p
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {version.acquisitionJustification}
              </p>
            </div>

            <div>
              <h4
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Public Purpose
              </h4>
              <p
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {version.publicPurpose}
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem',
              }}
            >
              <div>
                <h4
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '0.375rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Applicable Legal Framework
                </h4>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  {version.legalFramework}
                </div>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '0.375rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Administrative Approval
                </h4>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {version.administrativeApprovalRef ? (
                    <div>
                      <strong>Ref:</strong> {version.administrativeApprovalRef}
                      {version.administrativeApprovalDate && (
                        <span
                          style={{
                            marginLeft: '1rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          (Dated:{' '}
                          {new Date(
                            version.administrativeApprovalDate
                          ).toLocaleDateString()}
                          )
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                      }}
                    >
                      No administrative approval reference recorded
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '0.375rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Land Requirement Explanation
              </h4>
              <p
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {version.landRequirementExplanation}
              </p>
            </div>

            {/* Supporting Documents */}
            {version.supportingDocuments &&
              version.supportingDocuments.length > 0 && (
                <div>
                  <h4
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: '0.5rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Supporting Documents ({version.supportingDocuments.length})
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            textAlign: 'left',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <th style={{ padding: '0.5rem' }}>Type</th>
                          <th style={{ padding: '0.5rem' }}>Reference #</th>
                          <th style={{ padding: '0.5rem' }}>Title</th>
                          <th style={{ padding: '0.5rem' }}>File Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {version.supportingDocuments.map(
                          (doc: any, idx: number) => (
                            <tr
                              key={idx}
                              style={{
                                borderBottom: '1px solid var(--border-color)',
                              }}
                            >
                              <td
                                style={{
                                  padding: '0.5rem',
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {doc.documentType}
                              </td>
                              <td
                                style={{
                                  padding: '0.5rem',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {doc.documentNumber || '—'}
                              </td>
                              <td
                                style={{
                                  padding: '0.5rem',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {doc.title}
                              </td>
                              <td
                                style={{
                                  padding: '0.5rem',
                                  color: '#60a5fa',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {doc.fileUrl || '—'}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No version content loaded.</p>
        )}
      </div>

      {/* Version History Table Card */}
      {versionsList.length > 0 && (
        <div
          className="card"
          style={{
            padding: '1.5rem',
            marginBottom: '1.5rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '1rem',
            }}
          >
            Proposal Version History ({versionsList.length})
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '0.5rem' }}>Version</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                  <th style={{ padding: '0.5rem' }}>Created</th>
                  <th style={{ padding: '0.5rem' }}>Submitted</th>
                  <th style={{ padding: '0.5rem' }}>Remarks</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {versionsList.map((v) => {
                  const isCurrentVer = v.id === proposal.currentVersionId;
                  const vBadge =
                    STATUS_BADGE_STYLES[v.status] || STATUS_BADGE_STYLES.DRAFT;

                  return (
                    <tr
                      key={v.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor:
                          version?.id === v.id
                            ? 'rgba(59, 130, 246, 0.05)'
                            : undefined,
                      }}
                    >
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          Version {v.versionNumber}
                        </span>
                        {isCurrentVer && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.6875rem',
                              color: '#60a5fa',
                              fontWeight: 700,
                            }}
                          >
                            (Current)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '9999px',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            backgroundColor: vBadge.bg,
                            color: vBadge.color,
                            border: `1px solid ${vBadge.border}`,
                          }}
                        >
                          {vBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                        {new Date(v.createdAt).toLocaleDateString()}
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          by {v.creator?.name || 'Officer'}
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                        {v.submittedAt ? (
                          <>
                            {new Date(v.submittedAt).toLocaleDateString()}
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              by {v.submitter?.name || 'Officer'}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '0.5rem',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                        }}
                      >
                        {v.reviewRemarks || '—'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleSelectVersion(v)}
                          className="btn btn-outline"
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          {version?.id === v.id ? 'Viewing' : 'View Content'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit & Workflow History */}
      {proposal.workflowHistory && proposal.workflowHistory.length > 0 && (
        <div
          className="card"
          style={{
            padding: '1.5rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '1rem',
            }}
          >
            Workflow Audit History
          </h2>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {proposal.workflowHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.8125rem',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '0.25rem',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        color: '#60a5fa',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    >
                      {item.action}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      to status <strong>{item.toStatus}</strong> (v
                      {item.versionNumber})
                    </span>
                  </div>
                  {item.remarks && (
                    <div
                      style={{
                        color: 'var(--text-muted)',
                        marginTop: '0.25rem',
                        fontStyle: 'italic',
                      }}
                    >
                      &ldquo;{item.remarks}&rdquo;
                    </div>
                  )}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div>{item.actor.name}</div>
                  <div>{new Date(item.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: VALIDATION RESULTS
      ───────────────────────────────────────────────────────────── */}
      {showValidationModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '0.5rem',
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.75rem',
              }}
            >
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Proposal Validation Report (Version {viewingVersion?.versionNumber})
              </h3>
              <button
                onClick={() => setShowValidationModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {isValidating && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Running deterministic rule-based checks...
              </div>
            )}

            {validationError && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem',
                }}
              >
                {validationError}
              </div>
            )}

            {validationReport && (
              <div>
                {/* Summary Banner */}
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.375rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    backgroundColor:
                      validationReport.overallResult === 'PASSED'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : validationReport.hasBlockingErrors
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                    border: `1px solid ${
                      validationReport.overallResult === 'PASSED'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : validationReport.hasBlockingErrors
                        ? 'rgba(239, 68, 68, 0.3)'
                        : 'rgba(245, 158, 11, 0.3)'
                    }`,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong
                        style={{
                          fontSize: '1.125rem',
                          color:
                            validationReport.overallResult === 'PASSED'
                              ? '#10b981'
                              : validationReport.hasBlockingErrors
                              ? '#ef4444'
                              : '#f59e0b',
                        }}
                      >
                        Overall Result: {validationReport.overallResult}
                      </strong>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {validationReport.hasBlockingErrors
                        ? `Submission blocked: ${validationReport.summary.blockingErrors} critical error(s) must be resolved.`
                        : 'Proposal meets minimum completeness criteria for submission.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#10b981' }}>
                      ✓ {validationReport.summary.passed} Passed
                    </span>
                    <span style={{ color: '#ef4444' }}>
                      ✗ {validationReport.summary.failed} Failed
                    </span>
                    <span style={{ color: '#f59e0b' }}>
                      ⚠ {validationReport.summary.warnings} Warnings
                    </span>
                  </div>
                </div>

                {/* Individual Checks List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {validationReport.checks.map((chk) => (
                    <div
                      key={chk.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.375rem',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '0.25rem',
                                fontWeight: 700,
                                backgroundColor:
                                  chk.status === 'PASSED'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : chk.status === 'FAILED'
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : 'rgba(245, 158, 11, 0.15)',
                                color:
                                  chk.status === 'PASSED'
                                    ? '#10b981'
                                    : chk.status === 'FAILED'
                                    ? '#ef4444'
                                    : '#f59e0b',
                              }}
                            >
                              {chk.status}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {chk.name}
                            </span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              ({chk.category})
                            </span>
                            {chk.isBlocking && chk.status === 'FAILED' && (
                              <span
                                style={{
                                  fontSize: '0.625rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                  color: '#ef4444',
                                  fontWeight: 700,
                                }}
                              >
                                BLOCKING
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '0.375rem 0 0 0', color: 'var(--text-secondary)' }}>
                            {chk.message}
                          </p>
                          {chk.correctiveAction && chk.status !== 'PASSED' && (
                            <p style={{ margin: '0.25rem 0 0 0', color: '#fb923c', fontStyle: 'italic' }}>
                              ↳ Action: {chk.correctiveAction}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setShowValidationModal(false)}
                className="btn btn-secondary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: SUBMISSION CONFIRMATION
      ───────────────────────────────────────────────────────────── */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '0.5rem',
              maxWidth: '600px',
              width: '100%',
              padding: '1.5rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '0.75rem',
              }}
            >
              Submit Acquisition Proposal for Ministry Review
            </h3>

            <div
              style={{
                padding: '0.875rem 1rem',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '0.375rem',
                color: '#60a5fa',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                lineHeight: 1.5,
              }}
            >
              <strong>Important:</strong> Upon submission, Version{' '}
              {proposal.currentVersionNumber} becomes permanently immutable and
              will be locked from further edits. Proposal will transition to{' '}
              <strong>SUBMITTED</strong> status for Ministry scrutiny.
            </div>

            {submitError && (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.375rem',
                  color: '#f87171',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {submitError}
              </div>
            )}

            {submitSuccess && (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '0.375rem',
                  color: '#10b981',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                ✓ Proposal submitted successfully! Reloading...
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.375rem',
                }}
              >
                Submission Remarks (Optional):
              </label>
              <textarea
                value={submitRemarks}
                onChange={(e) => setSubmitRemarks(e.target.value)}
                placeholder="Enter any administrative or transmittal remarks..."
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  minHeight: '80px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-secondary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitProposal}
                disabled={isSubmitting || submitSuccess}
                id="confirm-submit-btn"
                className="btn btn-primary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
              >
                {isSubmitting ? 'Validating & Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: MAKE CHANGES (NEW VERSION FOR CORRECTION)
      ───────────────────────────────────────────────────────────── */}
      {showMakeChangesModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '0.5rem',
              maxWidth: '600px',
              width: '100%',
              padding: '1.5rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '0.75rem',
              }}
            >
              Make Changes: Initialize Next Proposal Version
            </h3>

            <div
              style={{
                padding: '0.875rem 1rem',
                backgroundColor: 'rgba(234, 88, 12, 0.1)',
                border: '1px solid rgba(234, 88, 12, 0.3)',
                borderRadius: '0.375rem',
                color: '#fb923c',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                lineHeight: 1.5,
              }}
            >
              The system will create Version {proposal.currentVersionNumber + 1}{' '}
              under this proposal initialized by copying the content of Version{' '}
              {proposal.currentVersionNumber}. You will then be able to edit the
              new draft, run validation, and resubmit. Previous submitted versions
              will remain unchanged.
            </div>

            {makeChangesError && (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.375rem',
                  color: '#f87171',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {makeChangesError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.375rem',
                }}
              >
                Correction Initiation Remarks (Optional):
              </label>
              <textarea
                value={makeChangesRemarks}
                onChange={(e) => setMakeChangesRemarks(e.target.value)}
                placeholder="Reason or plan for revision (e.g. Updating justification per Ministry observations)..."
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  minHeight: '80px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setShowMakeChangesModal(false)}
                disabled={isMakingChanges}
                className="btn btn-secondary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.8125rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleMakeChanges}
                disabled={isMakingChanges}
                id="confirm-make-changes-btn"
                className="btn btn-warning"
                style={{
                  padding: '0.45rem 1rem',
                  fontSize: '0.8125rem',
                  backgroundColor: 'rgba(234, 88, 12, 0.9)',
                  color: '#fff',
                  border: 'none',
                }}
              >
                {isMakingChanges ? 'Creating Version...' : 'Initialize New Draft Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
