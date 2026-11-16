import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { CompetentAuthoritiesClient } from './competent-authorities-client';

export const metadata = {
  title: 'Competent Authorities | NLAMS',
  description:
    'Manage statutory Competent Authorities, designations, geographic jurisdictions, and assigned officers.',
};

export default async function CompetentAuthoritiesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;
  const roles = authContext?.roles ?? [];
  const isMinistryAdmin = roles.includes('MINISTRY_ADMIN');
  const canManage = isSuperAdmin || isMinistryAdmin;

  return (
    <CompetentAuthoritiesClient
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
      canManageAuthorities={canManage}
      currentUserId={user.id}
    />
  );
}
