'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ProposalWithDetails } from '../../../../repositories/acquisition-proposal.repository';
import type { ProposalStatus } from '../../../../../db/schema/acquisition-proposals';

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
}: ProposalDetailClientProps) {
  const [proposal, setProposal] = useState<ProposalWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProposal() {
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
        } else {
          throw new Error(json.error || 'Failed to load proposal.');
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'An error occurred while loading proposal.'
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchProposal();
  }, [proposalId]);

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading acquisition proposal details...</p>
      </div>
    );
  }

  if (errorMessage || !proposal) {
    return (
      <div className="container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
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
  const isCreator = proposal.createdBy === currentUserId;
  const isDraft = proposal.currentStatus === 'DRAFT';
  const version = proposal.currentVersion;

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Navigation */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        {isDraft && isCreator && (
          <Link
            href={`/acquisition-proposals/${proposal.id}/edit`}
            id="edit-proposal-btn"
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
              padding: '0.45rem 1rem',
              fontSize: '0.875rem',
              borderRadius: '0.375rem',
              fontWeight: 600,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Draft
          </Link>
        )}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
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
                Version {proposal.currentVersionNumber}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Created on {new Date(proposal.createdAt).toLocaleDateString()} by{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{proposal.creator.name}</strong> ({proposal.creator.email})
            </p>
          </div>

          <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <div>Last Updated: {new Date(proposal.updatedAt).toLocaleString()}</div>
            <div>Implementing Agency: <strong style={{ color: 'var(--text-primary)' }}>{proposal.implementingAgency.name}</strong></div>
          </div>
        </div>
      </div>

      {/* Grid: Context Information */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
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
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Infrastructure Project
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Project Name</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proposal.project.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Code</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{proposal.project.projectCode}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Type</span>
                <span style={{ color: 'var(--text-secondary)' }}>{proposal.project.projectType}</span>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Administrative Jurisdiction</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {proposal.project.administrativeUnit.name} ({proposal.project.administrativeUnit.code})
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
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Acquisition Case
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Case Reference</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                {proposal.acquisitionCase.caseReference}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Case Title</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{proposal.acquisitionCase.title}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Status</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>{proposal.acquisitionCase.status}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Total Parcels</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {proposal.linkedInventory.totalParcelCount} parcels
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Affected Area</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {proposal.linkedInventory.aggregateAffectedArea} {proposal.linkedInventory.areaUnit}
                </span>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Approval Date</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {proposal.linkedInventory.reviewedAt
                  ? new Date(proposal.linkedInventory.reviewedAt).toLocaleDateString()
                  : 'Approved'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
              ✓ Immutable verified snapshot preserved.
            </div>
          </div>
        </div>
      </div>

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
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
          Proposal Substantive Content (Version {proposal.currentVersionNumber})
        </h2>

        {version ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                        <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)' }}>
                          (Dated: {new Date(version.administrativeApprovalDate).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No administrative approval reference recorded
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
            {version.supportingDocuments && version.supportingDocuments.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Supporting Documents ({version.supportingDocuments.length})
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem' }}>Type</th>
                        <th style={{ padding: '0.5rem' }}>Reference #</th>
                        <th style={{ padding: '0.5rem' }}>Title</th>
                        <th style={{ padding: '0.5rem' }}>File Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {version.supportingDocuments.map((doc, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>{doc.documentType}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{doc.documentNumber || '—'}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>{doc.title}</td>
                          <td style={{ padding: '0.5rem', color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{doc.fileUrl || '—'}</td>
                        </tr>
                      ))}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Workflow Audit History
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      to status <strong>{item.toStatus}</strong> (v{item.versionNumber})
                    </span>
                  </div>
                  {item.remarks && (
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                      &ldquo;{item.remarks}&rdquo;
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  <div>{item.actor.name}</div>
                  <div>{new Date(item.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

