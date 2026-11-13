'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProposalWithDetails } from '../../../../../repositories/acquisition-proposal.repository';
import type { ProposalSupportingDocument } from '../../../../../../db/schema/acquisition-proposals';

interface EditProposalClientProps {
  proposalId: string;
  currentUserId: string;
}

interface SupportingDocItem {
  documentType: string;
  documentNumber: string;
  title: string;
  fileUrl: string;
}

const COMMON_LEGAL_FRAMEWORKS = [
  'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (RFCTLARR)',
  'National Highways Act, 1956 (NHA)',
  'Railways Act, 1989',
  'Metro Railways (Construction of Works) Act, 1978',
  'Coal Bearing Areas (Acquisition and Development) Act, 1957',
  'State Land Acquisition Act & Amendments',
];

export function EditProposalClient({
  proposalId,
  currentUserId,
}: EditProposalClientProps) {
  const router = useRouter();

  const [proposal, setProposal] = useState<ProposalWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [acquisitionJustification, setAcquisitionJustification] = useState('');
  const [publicPurpose, setPublicPurpose] = useState('');
  const [legalFramework, setLegalFramework] = useState('');
  const [landRequirementExplanation, setLandRequirementExplanation] = useState('');
  const [administrativeApprovalRef, setAdministrativeApprovalRef] = useState('');
  const [administrativeApprovalDate, setAdministrativeApprovalDate] = useState('');

  // Supporting Documents
  const [supportingDocs, setSupportingDocs] = useState<SupportingDocItem[]>([]);
  const [docType, setDocType] = useState('Administrative Sanction');
  const [docNumber, setDocNumber] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docFileUrl, setDocFileUrl] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadProposal() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/acquisition-proposals/${proposalId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Proposal not found.');
          if (res.status === 403) throw new Error('Access denied to this proposal.');
          throw new Error('Failed to load proposal details.');
        }

        const json = await res.json();
        if (json.success) {
          const p: ProposalWithDetails = json.data;
          setProposal(p);

          // Populate form fields from currentVersion
          if (p.currentVersion) {
            setAcquisitionJustification(p.currentVersion.acquisitionJustification || '');
            setPublicPurpose(p.currentVersion.publicPurpose || '');
            setLegalFramework(p.currentVersion.legalFramework || COMMON_LEGAL_FRAMEWORKS[0]);
            setLandRequirementExplanation(p.currentVersion.landRequirementExplanation || '');
            setAdministrativeApprovalRef(p.currentVersion.administrativeApprovalRef || '');
            if (p.currentVersion.administrativeApprovalDate) {
              setAdministrativeApprovalDate(
                new Date(p.currentVersion.administrativeApprovalDate)
                  .toISOString()
                  .split('T')[0]
              );
            }
            if (p.currentVersion.supportingDocuments) {
              setSupportingDocs(
                p.currentVersion.supportingDocuments.map((doc: ProposalSupportingDocument) => ({
                  documentType: doc.documentType,
                  documentNumber: doc.documentNumber || '',
                  title: doc.title,
                  fileUrl: doc.fileUrl || '',
                }))
              );
            }
          }
        } else {
          throw new Error(json.error || 'Failed to load proposal.');
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Error loading proposal.'
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadProposal();
  }, [proposalId]);

  const handleAddSupportingDoc = () => {
    if (!docTitle.trim()) return;
    setSupportingDocs((prev) => [
      ...prev,
      {
        documentType: docType,
        documentNumber: docNumber.trim(),
        title: docTitle.trim(),
        fileUrl: docFileUrl.trim(),
      },
    ]);
    setDocNumber('');
    setDocTitle('');
    setDocFileUrl('');
  };

  const handleRemoveSupportingDoc = (index: number) => {
    setSupportingDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    if (acquisitionJustification.trim().length < 10) {
      setErrorMessage('Acquisition justification must be at least 10 characters.');
      return;
    }

    if (publicPurpose.trim().length < 10) {
      setErrorMessage('Public purpose must be at least 10 characters.');
      return;
    }

    if (!legalFramework.trim()) {
      setErrorMessage('Applicable legal framework is required.');
      return;
    }

    if (landRequirementExplanation.trim().length < 10) {
      setErrorMessage('Land requirement explanation must be at least 10 characters.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        acquisitionJustification: acquisitionJustification.trim(),
        publicPurpose: publicPurpose.trim(),
        legalFramework: legalFramework.trim(),
        landRequirementExplanation: landRequirementExplanation.trim(),
        administrativeApprovalRef: administrativeApprovalRef.trim() || null,
        administrativeApprovalDate: administrativeApprovalDate || null,
        supportingDocuments:
          supportingDocs.length > 0
            ? supportingDocs.map((doc, idx) => ({
                id: `doc-${idx + 1}`,
                documentType: doc.documentType,
                documentNumber: doc.documentNumber || undefined,
                title: doc.title,
                fileUrl: doc.fileUrl || undefined,
                uploadedAt: new Date().toISOString(),
              }))
            : null,
      };

      const res = await fetch(`/api/acquisition-proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update draft proposal.');
      }

      setSaveSuccess(true);
      setTimeout(() => {
        router.push(`/acquisition-proposals/${proposalId}`);
      }, 700);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while saving draft.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading proposal for editing...</p>
      </div>
    );
  }

  if (errorMessage && !proposal) {
    return (
      <div className="container" style={{ padding: '2rem' }}>
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
          {errorMessage}
        </div>
        <Link href="/acquisition-proposals" className="btn btn-secondary">
          ← Back to Proposals
        </Link>
      </div>
    );
  }

  if (!proposal) return null;

  // Authorization check
  const isCreator = proposal.createdBy === currentUserId;
  const isDraft = proposal.currentStatus === 'DRAFT';

  if (!isDraft) {
    return (
      <div className="container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div
          className="card"
          style={{
            padding: '2rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Proposal Cannot Be Edited
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            This acquisition proposal is in <strong>{proposal.currentStatus}</strong> status. Only proposals in <strong>DRAFT</strong> status may be edited.
          </p>
          <Link href={`/acquisition-proposals/${proposal.id}`} className="btn btn-primary">
            View Proposal
          </Link>
        </div>
      </div>
    );
  }

  if (!isCreator) {
    return (
      <div className="container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div
          className="card"
          style={{
            padding: '2rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f87171', marginBottom: '0.5rem' }}>
            Editing Restricted
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Only the original authorized creator may edit this draft proposal.
          </p>
          <Link href={`/acquisition-proposals/${proposal.id}`} className="btn btn-secondary">
            View Proposal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={`/acquisition-proposals/${proposal.id}`}
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          ← Back to Proposal Details
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Edit Draft Proposal
          </h1>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              color: 'var(--accent-secondary, #60a5fa)',
              fontWeight: 600,
            }}
          >
            {proposal.proposalNumber}
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Update draft content for Version {proposal.currentVersionNumber}. Locked case and approved inventory references cannot be modified.
        </p>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '0.375rem',
            color: '#10b981',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          ✓ Draft proposal updated successfully! Redirecting...
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: '0.875rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.375rem',
            color: '#f87171',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSaveDraft}>
        {/* Read-Only References Card (Case, Project, Inventory) */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: '1.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Locked Reference Information (Read-Only)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Fixed across draft updates
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Project</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proposal.project.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa', fontSize: '0.75rem', display: 'block' }}>
                {proposal.project.projectCode}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Acquisition Case</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{proposal.acquisitionCase.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                {proposal.acquisitionCase.caseReference}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Linked Approved Inventory</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>
                Version {proposal.linkedInventory.versionNumber} (Approved)
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                {proposal.linkedInventory.totalParcelCount} parcels ({proposal.linkedInventory.aggregateAffectedArea} {proposal.linkedInventory.areaUnit})
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 1: Justification & Public Purpose */}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            1. Project Purpose & Acquisition Justification
          </h2>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Acquisition Justification <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={4}
              value={acquisitionJustification}
              onChange={(e) => setAcquisitionJustification(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Public Purpose <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              value={publicPurpose}
              onChange={(e) => setPublicPurpose(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* SECTION 2: Legal Framework & Land Requirement */}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            2. Legal Framework & Land Requirement
          </h2>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Applicable Legal Framework <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              list="legal-framework-list-edit"
              value={legalFramework}
              onChange={(e) => setLegalFramework(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            />
            <datalist id="legal-framework-list-edit">
              {COMMON_LEGAL_FRAMEWORKS.map((lf) => (
                <option key={lf} value={lf} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Land Requirement Explanation <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              value={landRequirementExplanation}
              onChange={(e) => setLandRequirementExplanation(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* SECTION 3: Administrative Approval References */}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            3. Administrative Approval References
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
                Approval Order / Reference Number
              </label>
              <input
                type="text"
                className="form-control"
                value={administrativeApprovalRef}
                onChange={(e) => setAdministrativeApprovalRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
                Approval Date
              </label>
              <input
                type="date"
                className="form-control"
                value={administrativeApprovalDate}
                onChange={(e) => setAdministrativeApprovalDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: Supporting Documents */}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            4. Supporting Document References & Attachments
          </h2>

          <div
            style={{
              padding: '1rem',
              borderRadius: '0.375rem',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Document Type
                </label>
                <select
                  className="form-select"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <option value="Administrative Sanction">Administrative Sanction</option>
                  <option value="Government Order">Government Order</option>
                  <option value="Feasibility Report">Feasibility Report</option>
                  <option value="Environmental Clearance">Environmental Clearance</option>
                  <option value="SIA Terms of Reference">SIA Terms of Reference</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. DOC-REF-101"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Document Title <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. In-Principle CA Sanction"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  File Reference / URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. /docs/sanctions/2026/sanction.pdf"
                  value={docFileUrl}
                  onChange={(e) => setDocFileUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddSupportingDoc}
              className="btn btn-outline"
              disabled={!docTitle.trim()}
              style={{
                fontSize: '0.8125rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '0.25rem',
              }}
            >
              + Add Supporting Document
            </button>
          </div>

          {supportingDocs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Type</th>
                    <th style={{ padding: '0.5rem' }}>Ref #</th>
                    <th style={{ padding: '0.5rem' }}>Title</th>
                    <th style={{ padding: '0.5rem' }}>Reference / Link</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {supportingDocs.map((doc, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>{doc.documentType}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{doc.documentNumber || '—'}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>{doc.title}</td>
                      <td style={{ padding: '0.5rem', color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{doc.fileUrl || '—'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveSupportingDoc(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <Link
            href={`/acquisition-proposals/${proposal.id}`}
            className="btn btn-outline"
            style={{ textDecoration: 'none', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            id="update-proposal-draft-btn"
            className="btn btn-primary"
            disabled={isSaving}
            style={{
              padding: '0.55rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              borderRadius: '0.375rem',
            }}
          >
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
