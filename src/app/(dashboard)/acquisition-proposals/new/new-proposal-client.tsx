'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface EligibleInventory {
  id: string;
  versionNumber: number;
  status: string;
  totalParcelCount: number;
  aggregateRecordedArea: string;
  aggregateAffectedArea: string;
  areaUnit: string;
  generatedAt: string;
  reviewedAt: string | null;
}

interface EligibleCase {
  id: string;
  caseReference: string;
  title: string;
  status: string;
  project: {
    id: string;
    projectCode: string;
    name: string;
    implementingAgencyId: string;
    administrativeUnitId: string;
  };
  approvedInventories: EligibleInventory[];
}

interface SupportingDocItem {
  documentType: string;
  documentNumber: string;
  title: string;
  fileUrl: string;
}

interface NewProposalClientProps {
  currentUserId: string;
  userRoles: string[];
}

const COMMON_LEGAL_FRAMEWORKS = [
  'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (RFCTLARR)',
  'National Highways Act, 1956 (NHA)',
  'Railways Act, 1989',
  'Metro Railways (Construction of Works) Act, 1978',
  'Coal Bearing Areas (Acquisition and Development) Act, 1957',
  'State Land Acquisition Act & Amendments',
];

export function NewProposalClient({}: NewProposalClientProps) {
  const router = useRouter();

  const [eligibleCases, setEligibleCases] = useState<EligibleCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected Case & Inventory
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedInventoryId, setSelectedInventoryId] = useState('');

  // Form Fields
  const [acquisitionJustification, setAcquisitionJustification] = useState('');
  const [publicPurpose, setPublicPurpose] = useState('');
  const [legalFramework, setLegalFramework] = useState(COMMON_LEGAL_FRAMEWORKS[0]);
  const [landRequirementExplanation, setLandRequirementExplanation] = useState('');
  const [administrativeApprovalRef, setAdministrativeApprovalRef] = useState('');
  const [administrativeApprovalDate, setAdministrativeApprovalDate] = useState('');

  // Supporting Documents
  const [supportingDocs, setSupportingDocs] = useState<SupportingDocItem[]>([]);
  const [docType, setDocType] = useState('Administrative Sanction');
  const [docNumber, setDocNumber] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docFileUrl, setDocFileUrl] = useState('');

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load eligible cases
  useEffect(() => {
    async function loadEligible() {
      setIsLoadingCases(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/acquisition-proposals/eligible-cases');
        if (!res.ok) {
          throw new Error('Failed to load eligible acquisition cases');
        }
        const json = await res.json();
        if (json.success) {
          setEligibleCases(json.data);
          if (json.data.length > 0) {
            setSelectedCaseId(json.data[0].id);
            if (json.data[0].approvedInventories.length > 0) {
              setSelectedInventoryId(json.data[0].approvedInventories[0].id);
            }
          }
        } else {
          throw new Error(json.error || 'Failed to load cases');
        }
      } catch (err: unknown) {
        setLoadError(
          err instanceof Error ? err.message : 'Error loading eligible cases'
        );
      } finally {
        setIsLoadingCases(false);
      }
    }

    loadEligible();
  }, []);

  // Update selected inventory when selected case changes
  const handleCaseChange = (caseId: string) => {
    setSelectedCaseId(caseId);
    const foundCase = eligibleCases.find((c) => c.id === caseId);
    if (foundCase && foundCase.approvedInventories.length > 0) {
      setSelectedInventoryId(foundCase.approvedInventories[0].id);
    } else {
      setSelectedInventoryId('');
    }
  };

  const selectedCase = eligibleCases.find((c) => c.id === selectedCaseId);
  const selectedInventory = selectedCase?.approvedInventories.find(
    (inv) => inv.id === selectedInventoryId
  );

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

    if (!selectedCaseId) {
      setErrorMessage('Please select an eligible acquisition case.');
      return;
    }

    if (!selectedInventoryId) {
      setErrorMessage(
        'A Ministry-approved Verified Land Inventory must be selected for the proposal.'
      );
      return;
    }

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
        acquisitionCaseId: selectedCaseId,
        linkedInventoryId: selectedInventoryId,
        acquisitionJustification: acquisitionJustification.trim(),
        publicPurpose: publicPurpose.trim(),
        legalFramework: legalFramework.trim(),
        landRequirementExplanation: landRequirementExplanation.trim(),
        administrativeApprovalRef: administrativeApprovalRef.trim() || undefined,
        administrativeApprovalDate: administrativeApprovalDate || undefined,
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
            : undefined,
      };

      const res = await fetch('/api/acquisition-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save acquisition proposal draft.');
      }

      // Navigate to proposal view
      router.push(`/acquisition-proposals/${json.data.id}`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while saving draft.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingCases) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading eligible acquisition cases...</p>
      </div>
    );
  }

  if (loadError) {
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
          {loadError}
        </div>
        <Link href="/acquisition-proposals" className="btn btn-secondary">
          ← Back to Proposals
        </Link>
      </div>
    );
  }

  if (eligibleCases.length === 0) {
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
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              color: '#fbbf24',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            No Eligible Acquisition Cases Available
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, maxWidth: '550px', margin: '0 auto 1.5rem auto' }}>
            To create an Acquisition Proposal, an acquisition case must:
            <br />• Belong to a <strong>REGISTERED</strong> infrastructure project.
            <br />• Have at least one Ministry-approved <strong>Verified Land Inventory</strong> (status APPROVED).
            <br />• Not already have an existing proposal (one proposal per case).
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link href="/acquisition-proposals" className="btn btn-secondary">
              ← Return to Proposals
            </Link>
            <Link href="/verified-land-inventories" className="btn btn-outline">
              Check Verified Land Inventories
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ marginBottom: '1rem' }}>
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
      </div>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Prepare Land Acquisition Proposal
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Step 1: Create and save draft proposal for the eligible acquisition case using its approved inventory.
        </p>
      </div>

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
        {/* SECTION 1: Case and Project Information */}
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
            1. Eligible Acquisition Case & Project Selection
          </h2>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Select Eligible Acquisition Case <span style={{ color: '#f87171' }}>*</span>
            </label>
            <select
              className="form-select"
              value={selectedCaseId}
              onChange={(e) => handleCaseChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            >
              {eligibleCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseReference} — {c.title} ({c.project.name})
                </option>
              ))}
            </select>
          </div>

          {selectedCase && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '0.375rem',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                fontSize: '0.8125rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Project Name</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCase.project.name}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Project Code</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{selectedCase.project.projectCode}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Case Reference</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedCase.caseReference}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Case Title</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{selectedCase.title}</span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Approved Verified Land Inventory Selection & Read-only preview */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              2. Approved Verified Land Inventory Selection
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.25rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 600,
              }}
            >
              Ministry-Approved Only
            </span>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Linked Inventory Version <span style={{ color: '#f87171' }}>*</span>
            </label>
            <select
              className="form-select"
              value={selectedInventoryId}
              onChange={(e) => setSelectedInventoryId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            >
              {selectedCase?.approvedInventories.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  Version {inv.versionNumber} — Approved ({inv.totalParcelCount} parcels, {inv.aggregateAffectedArea} {inv.areaUnit})
                </option>
              ))}
            </select>
          </div>

          {selectedInventory && (
            <div>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Approval Status</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>✓ APPROVED</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Verified Parcels</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedInventory.totalParcelCount}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Aggregate Affected Area</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedInventory.aggregateAffectedArea} {selectedInventory.areaUnit}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Approval Date</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {selectedInventory.reviewedAt
                      ? new Date(selectedInventory.reviewedAt).toLocaleDateString()
                      : 'Approved'}
                  </span>
                </div>
              </div>

              {/* Strict Notice */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  <strong>Read-Only Inventory:</strong> Approved verified parcel and inventory records are permanent snapshots. Modifying underlying parcel data within the proposal is not permitted.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3 & 4: Acquisition Justification & Public Purpose */}
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
            3. Project Purpose & Acquisition Justification
          </h2>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Acquisition Justification <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Explain the substantial need and justification for land acquisition for this project..."
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
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Minimum 10 characters detailing the strategic or infrastructural necessity.
            </small>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Public Purpose <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Specify the defined public purpose served (e.g., national highway connectivity, railway corridor, urban transit, flood management)..."
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
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Minimum 10 characters describing the public benefit and socio-economic objective.
            </small>
          </div>
        </div>

        {/* SECTION 5 & 6: Legal Framework & Land Requirement */}
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
            4. Legal Framework & Land Requirement
          </h2>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
              Applicable Legal Framework <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              list="legal-framework-list"
              value={legalFramework}
              onChange={(e) => setLegalFramework(e.target.value)}
              placeholder="Select or enter applicable statutory framework..."
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
            <datalist id="legal-framework-list">
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
              placeholder="Explain the extent of land required, alignment considerations, and minimization of impact..."
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

        {/* SECTION 7: Administrative Approval References */}
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
            5. Administrative Approval References
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-secondary)' }}>
                Approval Order / Reference Number
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. GO-MS-2026-4412"
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

        {/* SECTION 8: Supporting Document References */}
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
            6. Supporting Document References & Attachments
          </h2>

          {/* Add doc subform */}
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
                  placeholder="e.g. Competent Authority In-Principle Approval"
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
                  placeholder="e.g. /docs/sanctions/2026/ca-approval.pdf"
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

          {/* List of added docs */}
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

        {/* Action Buttons: Save Draft only (No Submit in Step 1) */}
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
            href="/acquisition-proposals"
            className="btn btn-outline"
            style={{ textDecoration: 'none', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Cancel
          </Link>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Proposals are saved as Draft in Step 1. Submission belongs to Step 2.
            </span>
            <button
              type="submit"
              id="save-proposal-draft-btn"
              className="btn btn-primary"
              disabled={isSaving}
              style={{
                padding: '0.55rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
              }}
            >
              {isSaving ? 'Saving Draft...' : 'Save Draft'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

