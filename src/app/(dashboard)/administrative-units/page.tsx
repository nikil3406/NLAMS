import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { AdministrativeUnitsClient } from './administrative-units-client';

export const metadata = {
  title: 'Administrative Hierarchy | NLAMS',
  description: 'Manage data-driven administrative hierarchy, state and district boundaries in NLAMS.',
};

export default async function AdministrativeUnitsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <AdministrativeUnitsClient
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
