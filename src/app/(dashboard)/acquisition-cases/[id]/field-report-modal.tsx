'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import type { FieldVerificationReportWithDetails } from '../../../../repositories/field-verification-report.repository';
import type { FieldVerificationEvidence } from '../../../../../db/schema/field-verification-evidence';
import { ConfirmSubmitReportModal } from './confirm-submit-report-modal';

interface FieldReportModalProps {
  caseId: string;
  caseParcel: CaseParcelWithDetails;
  reportId?: string | null;
  initialReport?: FieldVerificationReportWithDetails | null;
  caseStatus: string;
  currentUserId: string;
  userRoles: string[];
  onClose: () => void;
  onReportSaved: (report: FieldVerificationReportWithDetails) => void;
  onFollowUpInspection?: (parcel: CaseParcelWithDetails) => void;
}

const SUPPORTED_UNITS = ['SQ_M', 'HECTARE', 'ACRE', 'SQ_KM'] as const;
const EVIDENCE_TYPES = [
  'PHOTO',
  'SKETCH',
  'GEO_TAGGED_IMAGE',
  'SURVEY_RECORD',
  'NOTICE_COPY',
  'OTHER',
] as const;

export function FieldReportModal({
  caseId,
  caseParcel,
  reportId,
  initialReport,
  caseStatus,
  currentUserId,
  userRoles,
  onClose,
  onReportSaved,
  onFollowUpInspection,
}: FieldReportModalProps) {
  const { parcel } = caseParcel;

  // Authorization guards
  const isFieldOfficer = userRoles.includes('FIELD_OFFICER');
  const isAwaitingVerification = caseStatus === 'AWAITING_FIELD_VERIFICATION';

  // Form states
  const [report, setReport] = useState<FieldVerificationReportWithDetails | null>(
    initialReport ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialReport && !!reportId);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Field values
  const [verificationDate, setVerificationDate] = useState<string>('');
  const [outcome, setOutcome] = useState<string>('VERIFIED');
  const [observations, setObservations] = useState<string>('');
  const [measuredArea, setMeasuredArea] = useState<string>('');
  const [measuredAreaUnit, setMeasuredAreaUnit] = useState<string>('SQ_M');
  const [measurementMethod, setMeasurementMethod] = useState<string>('');
  const [measurementNotes, setMeasurementNotes] = useState<string>('');

  // Evidence list
  const [evidenceList, setEvidenceList] = useState<
    Array<{
      id?: string;
      evidenceType: string;
      fileReference: string;
      caption?: string | null;
      description?: string | null;
      createdAt?: Date;
    }>
  >([]);

  // New evidence input form
  const [newEvidenceType, setNewEvidenceType] = useState<string>('PHOTO');
  const [newFileReference, setNewFileReference] = useState<string>('');
  const [newCaption, setNewCaption] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isAddingEvidence, setIsAddingEvidence] = useState<boolean>(false);

  // Submission confirmation modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);

  // Load existing report if ID provided and no initialReport
  const fetchReport = useCallback(async () => {
    if (!reportId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports/${reportId}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to retrieve field verification report');
      }
      const json = await res.json();
      const loaded: FieldVerificationReportWithDetails = json.data;
      setReport(loaded);

      // Populate form fields
      if (loaded.verificationDate) {
        const d = new Date(loaded.verificationDate);
        setVerificationDate(d.toISOString().slice(0, 16));
      }
      if (loaded.outcome) setOutcome(loaded.outcome);
      if (loaded.observations) setObservations(loaded.observations);
      if (loaded.measuredArea) setMeasuredArea(String(loaded.measuredArea));
      if (loaded.measuredAreaUnit) setMeasuredAreaUnit(loaded.measuredAreaUnit);
      if (loaded.measurementMethod) setMeasurementMethod(loaded.measurementMethod);
      if (loaded.measurementNotes) setMeasurementNotes(loaded.measurementNotes);
      if (loaded.evidence) {
        setEvidenceList(loaded.evidence);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading report');
    } finally {
      setIsLoading(false);
    }
  }, [caseId, caseParcel.id, reportId]);

  useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
      if (initialReport.verificationDate) {
        const d = new Date(initialReport.verificationDate);
        setVerificationDate(d.toISOString().slice(0, 16));
      }
      if (initialReport.outcome) setOutcome(initialReport.outcome);
      if (initialReport.observations) setObservations(initialReport.observations);
      if (initialReport.measuredArea) setMeasuredArea(String(initialReport.measuredArea));
      if (initialReport.measuredAreaUnit) setMeasuredAreaUnit(initialReport.measuredAreaUnit);
      if (initialReport.measurementMethod) setMeasurementMethod(initialReport.measurementMethod);
      if (initialReport.measurementNotes) setMeasurementNotes(initialReport.measurementNotes);
      if (initialReport.evidence) {
        setEvidenceList(initialReport.evidence);
      }
    } else if (reportId) {
      fetchReport();
    } else {
      // Default to current local date/time for new inspection
      const now = new Date();
      setVerificationDate(now.toISOString().slice(0, 16));
    }
  }, [fetchReport, initialReport, reportId]);

  const isSubmitted = report?.status === 'SUBMITTED';
  const isAuthor = report ? report.createdBy === currentUserId : true;
  const canEdit = !isSubmitted && isAuthor && isFieldOfficer && isAwaitingVerification;

  // Handle Close with Unsaved Changes check
  const handleClose = () => {
    if (isDirty && canEdit) {
      const discard = window.confirm(
        'You have unsaved changes on this field verification report. Are you sure you want to discard them?'
      );
      if (!discard) return;
    }
    onClose();
  };

  // Add evidence item to report
  const handleAddEvidence = async () => {
    setEvidenceError(null);
    const trimmedRef = newFileReference.trim();
    if (!trimmedRef) {
      setEvidenceError('Storage Reference ID is required');
      return;
    }
    if (/^https?:\/\//i.test(trimmedRef)) {
      setEvidenceError('External URLs are not permitted. Enter a valid storage reference identifier.');
      return;
    }
    if (/^[a-zA-Z]:\\/i.test(trimmedRef) || /^\/[a-zA-Z]/i.test(trimmedRef)) {
      setEvidenceError('Local filesystem paths are not permitted. Enter a valid storage reference identifier.');
      return;
    }

    const newEvidencePayload = {
      evidenceType: newEvidenceType,
      fileReference: trimmedRef,
      caption: newCaption.trim() || null,
      description: newDescription.trim() || null,
    };

    // If report already exists in database, attach directly via API
    if (report?.id) {
      setIsAddingEvidence(true);
      try {
        const res = await fetch(
          `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports/${report.id}/evidence`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEvidencePayload),
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to attach evidence reference');
        }
        const json = await res.json();
        const createdEvidence: FieldVerificationEvidence = json.data;
        setEvidenceList((prev) => [...prev, createdEvidence]);
        setNewFileReference('');
        setNewCaption('');
        setNewDescription('');
        setSuccessMessage('Evidence item attached successfully.');
      } catch (err: unknown) {
        setEvidenceError(err instanceof Error ? err.message : 'Error attaching evidence');
      } finally {
        setIsAddingEvidence(false);
      }
    } else {
      // In-memory draft (report not yet saved)
      setEvidenceList((prev) => [...prev, { ...newEvidencePayload, createdAt: new Date() }]);
      setNewFileReference('');
      setNewCaption('');
      setNewDescription('');
      setIsDirty(true);
    }
  };

  // Save Draft (creates or updates draft without submitting)
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    const payload = {
      verificationDate: verificationDate ? new Date(verificationDate).toISOString() : null,
      outcome,
      observations: observations.trim() || null,
      measuredArea: measuredArea ? parseFloat(measuredArea) : null,
      measuredAreaUnit: measuredArea ? measuredAreaUnit : null,
      measurementMethod: measurementMethod.trim() || null,
      measurementNotes: measurementNotes.trim() || null,
      evidence: !report?.id
        ? evidenceList.map((e) => ({
            evidenceType: e.evidenceType,
            fileReference: e.fileReference,
            caption: e.caption,
            description: e.description,
          }))
        : undefined,
    };

    try {
      let saved: FieldVerificationReportWithDetails;
      if (!report?.id) {
        // Create Draft POST
        const res = await fetch(
          `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to create draft report');
        }
        const json = await res.json();
        saved = json.data;
      } else {
        // Update Draft PATCH
        const res = await fetch(
          `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports/${report.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to update draft report');
        }
        const json = await res.json();
        saved = json.data;
      }

      setReport(saved);
      setIsDirty(false);
      setSuccessMessage('Draft report saved successfully.');
      onReportSaved(saved);
      return saved;
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error saving draft');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Pre-validate before opening submission confirmation dialog
  const handlePreSubmit = () => {
    setErrorMessage(null);
    if (!verificationDate) {
      setErrorMessage('Inspection date and time is required for submission.');
      return;
    }
    if (!outcome) {
      setErrorMessage('Verification outcome decision is required for submission.');
      return;
    }
    if (!observations.trim()) {
      setErrorMessage('Field observations cannot be empty for submission.');
      return;
    }
    if (measuredArea) {
      const num = parseFloat(measuredArea);
      if (isNaN(num) || num <= 0) {
        setErrorMessage('Measured area must be a positive number greater than 0.');
        return;
      }
      if (!measuredAreaUnit) {
        setErrorMessage('Measurement unit is required when measured area is entered.');
        return;
      }
    }
    if (evidenceList.length === 0) {
      setErrorMessage(
        'Submission requirement: At least one linked evidence item (photo, sketch, or survey record) must be attached before submitting.'
      );
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Final submission execution
  const handleExecuteSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // If there are unsaved changes or new report, save draft first
      let currentReport = report;
      if (!currentReport?.id || isDirty) {
        const saved = await handleSaveDraft();
        if (!saved) {
          setIsSubmitting(false);
          setIsConfirmModalOpen(false);
          return;
        }
        currentReport = saved;
      }

      // Execute Submit POST
      const res = await fetch(
        `/api/acquisition-cases/${caseId}/parcels/${caseParcel.id}/reports/${currentReport.id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remarks: 'Field verification submitted by officer' }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to submit verification report');
      }

      const json = await res.json();
      const submittedReport: FieldVerificationReportWithDetails = json.data;

      setReport(submittedReport);
      setIsDirty(false);
      setIsConfirmModalOpen(false);
      setSuccessMessage('Report submitted successfully! Findings are locked for Land Officer review.');
      onReportSaved(submittedReport);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error submitting report');
      setIsConfirmModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60,
          padding: '1rem',
          backdropFilter: 'blur(4px)',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving && !isSubmitting) handleClose();
        }}
        id="field-report-modal"
      >
        <div
          style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                  {report?.id ? (isSubmitted ? 'Historical Inspection Report' : 'Draft Verification Report') : 'New Parcel Field Verification'}
                </h3>
                {report && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      background: isSubmitted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: isSubmitted ? '#34d399' : '#60a5fa',
                      border: `1px solid ${isSubmitted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                    }}
                    id="report-status-badge"
                  >
                    {isSubmitted ? 'SUBMITTED (LOCKED)' : 'DRAFT'}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
                Parcel {parcel.parcelId} • Survey #{parcel.surveyNumber} {parcel.subdivisionNumber ? `(${parcel.subdivisionNumber})` : ''} • {parcel.village}, {parcel.taluk}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.25rem',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
              id="close-field-report-modal-btn"
            >
              ✕
            </button>
          </div>

          {/* Banner Notices */}
          {isSubmitted && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '0.75rem 1.5rem',
                fontSize: '0.8125rem',
                color: '#6ee7b7',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              id="submitted-report-banner"
            >
              <span>🔒</span>
              <div>
                <strong>Official Historical Record:</strong> Submitted on{' '}
                {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : ''} by{' '}
                {report.verifier?.name || 'Authorized Field Officer'}. This report is immutable and pending Land Officer review.
              </div>
            </div>
          )}

          {!isSubmitted && report && !isAuthor && (
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
                padding: '0.75rem 1.5rem',
                fontSize: '0.8125rem',
                color: '#93c5fd',
              }}
              id="draft-other-author-banner"
            >
              ℹ️ <strong>Read-Only Draft:</strong> This draft was created by {report.creator.name}. Under separation-of-duties rules, only the original author can edit or submit this draft.
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '0.75rem 1.5rem',
                fontSize: '0.8125rem',
                color: '#fca5a5',
              }}
              id="report-form-error-banner"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.75rem 1.5rem',
                fontSize: '0.8125rem',
                color: '#6ee7b7',
              }}
              id="report-form-success-banner"
            >
              ✓ {successMessage}
            </div>
          )}

          {/* Scrollable Form Body */}
          <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                <span className="spinner-sm" style={{ marginRight: '0.5rem' }} />
                Loading report details...
              </div>
            ) : (
              <>
                {/* Section A: Inspection Details */}
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    A. Inspection Findings & Outcome
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        Inspection Date & Time {canEdit && <span style={{ color: '#f87171' }}>*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={verificationDate}
                        onChange={(e) => {
                          setVerificationDate(e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!canEdit}
                        className="users-search-input"
                        style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                        id="report-verification-date-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        Field Verification Outcome {canEdit && <span style={{ color: '#f87171' }}>*</span>}
                      </label>
                      <select
                        value={outcome}
                        onChange={(e) => {
                          setOutcome(e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!canEdit}
                        className="users-search-input"
                        style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                        id="report-outcome-select"
                      >
                        <option value="VERIFIED">VERIFIED (Demarcation & measurements confirmed on ground)</option>
                        <option value="DISCREPANCY_FOUND">DISCREPANCY_FOUND (Boundary, area, or physical mismatch observed)</option>
                        <option value="INCONCLUSIVE">INCONCLUSIVE (Inspection inconclusive / access hindered)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                      Field Observations & Boundary Notes {canEdit && <span style={{ color: '#f87171' }}>*</span>}
                    </label>
                    <textarea
                      rows={3}
                      value={observations}
                      onChange={(e) => {
                        setObservations(e.target.value);
                        setIsDirty(true);
                      }}
                      disabled={!canEdit}
                      placeholder="Record ground observations, physical pillars located, encroachment findings, or site conditions..."
                      className="users-search-input"
                      style={{ width: '100%', minHeight: '80px', padding: '0.6rem', fontSize: '0.8125rem' }}
                      id="report-observations-input"
                    />
                  </div>
                </div>

                {/* Section B: Measurement Details (Distinct comparison) */}
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#34d399', margin: '0 0 1rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    B. Area Comparison & Field Measurements
                  </h4>

                  {/* 3-Way Area Contrast Display */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.875rem', marginBottom: '1.25rem' }}>
                    <div
                      style={{
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                      }}
                    >
                      <span style={{ fontSize: '0.6875rem', color: '#93c5fd', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        1. Recorded Total Area
                      </span>
                      <strong style={{ fontSize: '1.125rem', color: '#fff' }}>
                        {Number(parcel.totalArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </strong>
                      <span style={{ fontSize: '0.8125rem', color: '#93c5fd', marginLeft: '0.25rem' }}>{parcel.areaUnit}</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.6875rem', color: '#64748b' }}>Canonical land registry record</p>
                    </div>

                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                      }}
                    >
                      <span style={{ fontSize: '0.6875rem', color: '#fde68a', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        2. Proposed Affected Area
                      </span>
                      <strong style={{ fontSize: '1.125rem', color: '#fff' }}>
                        {Number(caseParcel.proposedAffectedArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </strong>
                      <span style={{ fontSize: '0.8125rem', color: '#fde68a', marginLeft: '0.25rem' }}>{caseParcel.affectedAreaUnit}</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.6875rem', color: '#64748b' }}>Target acquisition boundary</p>
                    </div>

                    <div
                      style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                      }}
                    >
                      <span style={{ fontSize: '0.6875rem', color: '#6ee7b7', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        3. Field-Measured Affected Area
                      </span>
                      <strong style={{ fontSize: '1.125rem', color: measuredArea ? '#34d399' : '#64748b' }}>
                        {measuredArea ? Number(measuredArea).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : 'Not Measured'}
                      </strong>
                      {measuredArea && (
                        <span style={{ fontSize: '0.8125rem', color: '#6ee7b7', marginLeft: '0.25rem' }}>{measuredAreaUnit}</span>
                      )}
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.6875rem', color: '#64748b' }}>On-ground physical survey</p>
                    </div>
                  </div>

                  {/* Measurement Inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        Field-Measured Affected Area (Optional)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        placeholder="e.g. 4480.5"
                        value={measuredArea}
                        onChange={(e) => {
                          setMeasuredArea(e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!canEdit}
                        className="users-search-input"
                        style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                        id="report-measured-area-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        Measurement Unit {measuredArea && <span style={{ color: '#f87171' }}>*</span>}
                      </label>
                      <select
                        value={measuredAreaUnit}
                        onChange={(e) => {
                          setMeasuredAreaUnit(e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!canEdit || !measuredArea}
                        className="users-search-input"
                        style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                        id="report-measured-unit-select"
                      >
                        {SUPPORTED_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        Measurement Method
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. DGPS Survey, Total Station"
                        value={measurementMethod}
                        onChange={(e) => {
                          setMeasurementMethod(e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!canEdit}
                        className="users-search-input"
                        style={{ width: '100%', height: '38px', fontSize: '0.8125rem' }}
                        id="report-measurement-method-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                      Measurement Notes & Benchmarks
                    </label>
                    <textarea
                      rows={2}
                      value={measurementNotes}
                      onChange={(e) => {
                        setMeasurementNotes(e.target.value);
                        setIsDirty(true);
                      }}
                      disabled={!canEdit}
                      placeholder="Coordinates system, benchmark reference markers, instrument calibration details..."
                      className="users-search-input"
                      style={{ width: '100%', minHeight: '60px', padding: '0.6rem', fontSize: '0.8125rem' }}
                      id="report-measurement-notes-input"
                    />
                  </div>
                </div>

                {/* Section C: Evidence & Attachments */}
                <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fbbf24', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      C. Field Evidence & Documentation
                    </h4>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: evidenceList.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: evidenceList.length > 0 ? '#34d399' : '#f87171',
                        border: `1px solid ${evidenceList.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      }}
                    >
                      {evidenceList.length} Attached {evidenceList.length === 0 ? '(At least 1 required)' : ''}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.4' }}>
                    Attach verified photo, survey sketch, cadastral overlay, or notice evidence. Storage reference keys link to verified ground capture repositories.
                  </p>

                  {/* Attached Evidence List */}
                  {evidenceList.length === 0 ? (
                    <div
                      style={{
                        padding: '1.5rem',
                        border: '1px dashed rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontSize: '0.8125rem',
                        marginBottom: '1rem',
                      }}
                      id="evidence-empty-box"
                    >
                      No evidence items attached yet. Evidence is mandatory for report submission.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }} id="evidence-items-list">
                      {evidenceList.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          style={{
                            background: '#1e293b',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '6px',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8125rem',
                          }}
                          id={`evidence-item-${item.fileReference}`}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '3px',
                                  background: 'rgba(59, 130, 246, 0.2)',
                                  color: '#60a5fa',
                                  fontWeight: 600,
                                }}
                              >
                                {item.evidenceType}
                              </span>
                              <span style={{ fontFamily: 'monospace', color: '#f1f5f9', fontWeight: 600 }}>
                                {item.fileReference}
                              </span>
                              {item.caption && (
                                <span style={{ color: '#cbd5e1' }}>— {item.caption}</span>
                              )}
                            </div>
                            {item.description && (
                              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                {item.description}
                              </p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Draft item'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Evidence Form (Draft only) */}
                  {canEdit && (
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        padding: '1rem',
                      }}
                      id="add-evidence-form-box"
                    >
                      <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8125rem', color: '#f1f5f9' }}>
                        + Attach Evidence Item
                      </h5>

                      {evidenceError && (
                        <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                          ⚠️ {evidenceError}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Evidence Type
                          </label>
                          <select
                            value={newEvidenceType}
                            onChange={(e) => setNewEvidenceType(e.target.value)}
                            className="users-search-input"
                            style={{ width: '100%', height: '36px', fontSize: '0.75rem' }}
                            id="new-evidence-type-select"
                          >
                            {EVIDENCE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Storage Reference Key / ID * (e.g. evid_ka_blr_001_photo)
                          </label>
                          <input
                            type="text"
                            placeholder="evid_survey_record_101A"
                            value={newFileReference}
                            onChange={(e) => setNewFileReference(e.target.value)}
                            className="users-search-input"
                            style={{ width: '100%', height: '36px', fontSize: '0.8125rem' }}
                            id="new-evidence-ref-input"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Caption (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Boundary stone marker at NW corner"
                            value={newCaption}
                            onChange={(e) => setNewCaption(e.target.value)}
                            className="users-search-input"
                            style={{ width: '100%', height: '36px', fontSize: '0.75rem' }}
                            id="new-evidence-caption-input"
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Description (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Geo-tagged photo with 5m GPS accuracy"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            className="users-search-input"
                            style={{ width: '100%', height: '36px', fontSize: '0.75rem' }}
                            id="new-evidence-description-input"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleAddEvidence}
                          disabled={isAddingEvidence}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }}
                          id="add-evidence-btn"
                        >
                          {isAddingEvidence ? 'Attaching...' : '+ Add Evidence Reference'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section D: Audit & Lineage */}
                {report && (
                  <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', color: '#94a3b8' }}>
                      <div>
                        <span>Created By:</span> <strong style={{ color: '#f1f5f9' }}>{report.creator.name}</strong>
                      </div>
                      <div>
                        <span>Created At:</span> <strong style={{ color: '#f1f5f9' }}>{new Date(report.createdAt).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span>Last Updated:</span> <strong style={{ color: '#f1f5f9' }}>{new Date(report.updatedAt).toLocaleString()}</strong>
                      </div>
                      {report.verifier && (
                        <div>
                          <span>Verified & Submitted By:</span> <strong style={{ color: '#34d399' }}>{report.verifier.name}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Controls */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              id="close-field-report-btn"
            >
              Close
            </button>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {isSubmitted && onFollowUpInspection && canEdit === false && isFieldOfficer && isAwaitingVerification && (
                <button
                  type="button"
                  onClick={() => onFollowUpInspection(caseParcel)}
                  className="btn-primary"
                  id="followup-inspection-btn"
                >
                  + Record Follow-Up Inspection
                </button>
              )}

              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSaving || isSubmitting}
                    className="btn-secondary"
                    id="save-report-draft-btn"
                  >
                    {isSaving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePreSubmit}
                    disabled={isSaving || isSubmitting}
                    className="btn-primary"
                    style={{ background: '#059669', borderColor: '#10b981' }}
                    id="open-submit-report-btn"
                  >
                    Submit Report...
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {isConfirmModalOpen && (
        <ConfirmSubmitReportModal
          parcelInfo={{
            parcelId: parcel.parcelId,
            surveyNumber: parcel.surveyNumber,
            village: parcel.village,
          }}
          reportData={{
            verificationDate,
            outcome,
            observations,
            measuredArea,
            measuredAreaUnit,
            evidenceCount: evidenceList.length,
          }}
          isSubmitting={isSubmitting}
          onConfirm={handleExecuteSubmit}
          onCancel={() => setIsConfirmModalOpen(false)}
        />
      )}
    </>
  );
}
