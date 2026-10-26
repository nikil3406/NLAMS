import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { AcquisitionCasesClient } from './acquisition-cases-client';

export const metadata = {
  title: 'Acquisition Cases | NLAMS',
  description: 'National Land Acquisition and Management System — Acquisition Cases',
};

export default async function AcquisitionCasesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <AcquisitionCasesClient
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}
