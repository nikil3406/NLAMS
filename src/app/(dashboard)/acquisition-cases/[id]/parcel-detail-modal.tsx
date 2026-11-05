import React, { useState } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import type { FieldVerificationReportWithDetails } from '../../../../repositories/field-verification-report.repository';
import { ParcelReportsSection } from './parcel-reports-section';
import { FieldReportModal } from './field-report-modal';
import { FieldVerificationReviewModal } from './field-verification-review-modal';

interface ParcelDetailModalProps {
  item: CaseParcelWithDetails;
  caseId?: string;
  caseStatus?: string;
  currentUserId?: string;
  userRoles?: string[];
  isSuperAdmin?: boolean;
  isVerifiedLandOfficer?: boolean;
  canEdit: boolean;
  onClose: () => void;
  onOpenEdit: () => void;
}

export function ParcelDetailModal({
  item,
  caseId,
  caseStatus,
  currentUserId,
  userRoles,
  isSuperAdmin = false,
  isVerifiedLandOfficer = true,
  canEdit,
  onClose,
  onOpenEdit,
}: ParcelDetailModalProps) {
  const { parcel, creator } = item;
  const [activeReportModal, setActiveReportModal] = useState<{
    isOpen: boolean;
    reportId?: string | null;
    reportData?: FieldVerificationReportWithDetails | null;
  }>({ isOpen: false });
  const [activeReviewModal, setActiveReviewModal] = useState<{
    isOpen: boolean;
    reportData: FieldVerificationReportWithDetails | null;
  }>({ isOpen: false, reportData: null });
  const [reportsRefreshTrigger, setReportsRefreshTrigger] = useState(0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      id="parcel-detail-modal"
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
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
                Parcel Details
              </h3>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  fontWeight: 600,
                }}
                id="modal-parcel-id"
              >
                {parcel.parcelId}
              </span>
            </div>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Survey #{parcel.surveyNumber}
              {parcel.subdivisionNumber ? ` / ${parcel.subdivisionNumber}` : ''} • {parcel.village}, {parcel.district}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
            aria-label="Close modal"
            id="close-parcel-detail-btn"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section A: Identification & Locality */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              A. Administrative Locality & Survey Reference
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: '8px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Village</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.village}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Taluk</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.taluk}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>District</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.district}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>State</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.state}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Survey Number</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.surveyNumber}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Subdivision</span>
                <strong style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.subdivisionNumber || '—'}</strong>
              </div>
            </div>
          </div>

          {/* Section B: Area Comparison */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              B. Area Extents (Distinct Values)
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: '8px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
                  Total Recorded Parcel Area
                </span>
                <strong style={{ color: '#fff', fontSize: '1.125rem' }} id="detail-total-area">
                  {parcel.totalArea} {parcel.areaUnit}
                </strong>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  Official legal land record
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#60a5fa', display: 'block' }}>
                  Proposed Affected Area
                </span>
                <strong style={{ color: '#60a5fa', fontSize: '1.125rem' }} id="detail-affected-area">
                  {item.proposedAffectedArea} {item.affectedAreaUnit}
                </strong>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  Acquisition case alignment
                </span>
              </div>
            </div>
          </div>

          {/* Section C: Classification & Description */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              C. Land Record & Physical Description
            </h4>
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Land Use</span>
                  <span style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.landUse || '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Record Reference</span>
                  <span style={{ color: '#fff', fontSize: '0.875rem' }}>{parcel.landRecordReference || '—'}</span>
                </div>
              </div>
              {parcel.physicalDescription && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                    Physical Description
                  </span>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.8125rem', lineHeight: '1.4' }}>
                    {parcel.physicalDescription}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section D: Spatial Reference Disclaimer */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              D. Spatial Demarcation Notice
            </h4>
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                fontSize: '0.75rem',
                color: '#93c5fd',
                lineHeight: '1.4',
              }}
            >
              Spatial coordinates and geometry are captured as non-authoritative references for field alignment and do not establish legally authoritative cadastral boundaries.
            </div>
          </div>

          {/* Section E: Field Verification Reports */}
          {caseId && (
            <ParcelReportsSection
              caseId={caseId}
              caseParcel={item}
              caseStatus={caseStatus || 'AWAITING_FIELD_VERIFICATION'}
              currentUserId={currentUserId || ''}
              userRoles={userRoles || []}
              onOpenReportModal={(reportId, reportData) => {
                if (reportData && reportData.status !== 'DRAFT') {
                  setActiveReviewModal({ isOpen: true, reportData });
                } else {
                  setActiveReportModal({ isOpen: true, reportId, reportData });
                }
              }}
              refreshTrigger={reportsRefreshTrigger}
            />
          )}
        </div>

        {/* Footer */}
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
            onClick={onClose}
            className="btn-secondary"
            id="close-parcel-detail-footer-btn"
          >
            Close
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onOpenEdit}
              className="btn-primary"
              id="edit-parcel-from-detail-btn"
            >
              ✎ Edit Affected Area
            </button>
          )}
        </div>
      </div>

      {/* Field Report Draft / Edit Modal */}
      {activeReportModal.isOpen && caseId && (
        <FieldReportModal
          caseId={caseId}
          caseParcel={item}
          reportId={activeReportModal.reportId}
          initialReport={activeReportModal.reportData}
          caseStatus={caseStatus || 'AWAITING_FIELD_VERIFICATION'}
          currentUserId={currentUserId || ''}
          userRoles={userRoles || []}
          onClose={() => setActiveReportModal({ isOpen: false })}
          onReportSaved={() => {
            setReportsRefreshTrigger((prev) => prev + 1);
          }}
          onFollowUpInspection={() => {
            setActiveReportModal({ isOpen: true, reportId: null, reportData: null });
          }}
        />
      )}

      {/* Field Verification Review / Inspection Modal */}
      {activeReviewModal.isOpen && activeReviewModal.reportData && caseId && (
        <FieldVerificationReviewModal
          report={activeReviewModal.reportData}
          caseId={caseId}
          caseParcelId={item.id}
          currentUserId={currentUserId || ''}
          userRoles={userRoles || []}
          isSuperAdmin={isSuperAdmin}
          isVerifiedLandOfficer={isVerifiedLandOfficer}
          onClose={() => setActiveReviewModal({ isOpen: false, reportData: null })}
          onDecisionSuccess={() => {
            setActiveReviewModal({ isOpen: false, reportData: null });
            setReportsRefreshTrigger((prev) => prev + 1);
          }}
          onCorrectionInitiated={(newDraft) => {
            setActiveReviewModal({ isOpen: false, reportData: null });
            setReportsRefreshTrigger((prev) => prev + 1);
            setActiveReportModal({ isOpen: true, reportId: newDraft.id, reportData: newDraft });
          }}
        />
      )}
    </div>
  );
}
