import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { ProjectsClient } from './projects-client';

export const metadata = {
  title: 'Projects | NLAMS',
  description: 'National Land Acquisition and Management System — Infrastructure Projects',
};

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <ProjectsClient
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}
