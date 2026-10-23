import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { NewAcquisitionCaseClient } from './new-acquisition-case-client';

export const metadata = {
  title: 'New Acquisition Case | NLAMS',
  description: 'Initiate a new land acquisition case linked to an infrastructure project in NLAMS.',
};

export default async function NewAcquisitionCasePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  const canCreate = isSuperAdmin || userPermissions.includes('ACQUISITION_CASE_CREATE');
  if (!canCreate) {
    redirect('/acquisition-cases');
  }

  return (
    <NewAcquisitionCaseClient
      currentUserId={user.id}
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
