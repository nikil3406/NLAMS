import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { AcquisitionProposalsClient } from './acquisition-proposals-client';

export const metadata = {
  title: 'Acquisition Proposals | NLAMS',
  description:
    'National Land Acquisition and Management System — Land Acquisition Proposal Management',
};

export default async function AcquisitionProposalsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext =
    await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <AcquisitionProposalsClient
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}

