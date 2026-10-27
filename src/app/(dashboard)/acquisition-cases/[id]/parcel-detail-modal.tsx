import React, { useState } from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import type { FieldVerificationReportWithDetails } from '../../../../repositories/field-verification-report.repository';
import { ParcelReportsSection } from './parcel-reports-section';
import { FieldReportModal } from './field-report-modal';

interface ParcelDetailModalProps {
  item: CaseParcelWithDetails;
  caseId?: string;
  caseStatus?: string;
  currentUserId?: string;
  userRoles?: string[];
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
                  fontSize: '0.8125rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
              >
                {parcel.parcelId}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
              Survey #{parcel.surveyNumber} {parcel.subdivisionNumber ? `(${parcel.subdivisionNumber})` : ''} • {parcel.village}, {parcel.taluk}
            </p>
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
              padding: '0.25rem',
            }}
            id="close-parcel-detail-btn"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Section A: Land Identification */}
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8', margin: '0 0 0.75rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              A. Land Identification
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>State</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.state}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>District</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.district}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Taluk</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.taluk}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Village</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.village}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Survey Number</span>
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{parcel.surveyNumber}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Subdivision / Hissa</span>
                <span style={{ color: '#f1f5f9' }}>{parcel.subdivisionNumber || 'None / Not recorded'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Land Record Reference</span>
                <span style={{ color: '#f1f5f9' }}>{parcel.landRecordReference || 'Not provided'}</span>
              </div>
            </div>
          </div>

          {/* Section B: Area Details */}
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#34d399', margin: '0 0 0.75rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              B. Area Details & Demarcation
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#93c5fd', display: 'block' }}>Total Recorded Area</span>
                <strong style={{ fontSize: '1.125rem', color: '#fff' }}>
                  {Number(parcel.totalArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                </strong>
                <span style={{ fontSize: '0.8125rem', color: '#93c5fd', marginLeft: '0.35rem' }}>{parcel.areaUnit}</span>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.6875rem', color: '#64748b' }}>Official cadastral record</p>
              </div>

              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#6ee7b7', display: 'block' }}>Proposed Affected Area</span>
                <strong style={{ fontSize: '1.125rem', color: '#fff' }}>
                  {Number(item.proposedAffectedArea).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                </strong>
                <span style={{ fontSize: '0.8125rem', color: '#6ee7b7', marginLeft: '0.35rem' }}>{item.affectedAreaUnit}</span>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.6875rem', color: '#64748b' }}>For current acquisition case</p>
              </div>
            </div>
          </div>

          {/* Section C: Physical Land Details */}
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fbbf24', margin: '0 0 0.75rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              C. Physical Land Details
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Current Land Use</span>
                <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{parcel.landUse || 'Not specified'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Physical Description & Observations</span>
                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {parcel.physicalDescription || 'No physical description recorded.'}
                </p>
              </div>
            </div>
          </div>

          {/* Section D: Spatial & Audit Metadata */}
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c084fc', margin: '0 0 0.75rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              D. Location & Audit Metadata
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Associated By</span>
                <span style={{ color: '#f1f5f9' }}>{creator.name} ({creator.email})</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Associated On</span>
                <span style={{ color: '#f1f5f9' }}>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Last Updated</span>
                <span style={{ color: '#f1f5f9' }}>{new Date(item.updatedAt).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Spatial Geometry</span>
                <span style={{ color: parcel.geometry ? '#34d399' : '#64748b' }}>
                  {parcel.geometry ? `Spatial boundary recorded (${parcel.geometry.type})` : 'No spatial geometry attached'}
                </span>
              </div>
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
                setActiveReportModal({ isOpen: true, reportId, reportData });
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

      {/* Field Report Modal */}
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
    </div>
  );
}

