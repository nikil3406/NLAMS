import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { AcquisitionCaseDetailsClient } from './acquisition-case-details-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Acquisition Case Details | NLAMS',
  description: 'View acquisition case details, linked project, and workflow history in NLAMS.',
};

export default async function AcquisitionCaseDetailsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;
  const userStatus = authContext?.user?.status ?? 'INACTIVE';
  const hasActiveAssignment = isSuperAdmin || (authContext?.assignments && authContext.assignments.length > 0);
  const isVerifiedLandOfficer =
    userStatus === 'ACTIVE' &&
    (isSuperAdmin || userRoles.includes('LAND_OFFICER')) &&
    Boolean(hasActiveAssignment);

  return (
    <AcquisitionCaseDetailsClient
      caseId={id}
      currentUserId={user.id}
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      isVerifiedLandOfficer={isVerifiedLandOfficer}
    />
  );
}
