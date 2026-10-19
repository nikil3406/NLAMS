import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { ProjectDetailsClient } from './project-details-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Project Details | NLAMS',
  description: 'View project details, implementing agency, and status in NLAMS.',
};

export default async function ProjectDetailsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <ProjectDetailsClient
      projectId={id}
      currentUserId={user.id}
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
