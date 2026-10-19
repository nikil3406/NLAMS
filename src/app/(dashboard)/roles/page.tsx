import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { RolesClient } from './roles-client';

export const metadata = {
  title: 'Roles & Permissions | NLAMS',
  description:
    'View and manage system roles and their permission grants within the National Land Acquisition Management System.',
};

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  // Only users with ROLE_VIEW permission may access this page
  if (!isSuperAdmin && !userPermissions.includes('ROLE_VIEW')) {
    redirect('/dashboard');
  }

  return (
    <RolesClient
      isSuperAdmin={isSuperAdmin}
      userPermissions={userPermissions}
    />
  );
}
