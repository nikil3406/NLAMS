import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { VerifiedLandInventoriesClient } from './verified-land-inventories-client';

export const metadata = {
  title: 'Verified Land Inventory | NLAMS',
  description: 'National Land Acquisition and Management System — Verified Land Inventories',
};

export default async function VerifiedLandInventoriesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <VerifiedLandInventoriesClient
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}

