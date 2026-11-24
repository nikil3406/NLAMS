'use client';

import React from 'react';
import type { CaseParcelWithDetails } from '../../../../repositories/parcel.repository';
import { ParcelEntryModal } from './parcel-entry-modal';

interface ParcelEditModalProps {
  caseId: string;
  item: CaseParcelWithDetails;
  onClose: () => void;
  onSuccess: (updated: CaseParcelWithDetails) => void;
}

/**
 * ParcelEditModal delegates directly to the comprehensive ParcelEntryModal
 * in edit mode (item supplied), reusing all creation form fields, validation,
 * conditional logic, and UI components without duplicating form code.
 */
export function ParcelEditModal({
  caseId,
  item,
  onClose,
  onSuccess,
}: ParcelEditModalProps) {
  return (
    <ParcelEntryModal
      caseId={caseId}
      item={item}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
