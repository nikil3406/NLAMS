import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../../lib/auth';
import { authorizationService } from '../../../../../services/authorization';
import { EditProjectClient } from './edit-project-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Edit Project | NLAMS',
  description: 'Update project information in NLAMS.',
};

export default async function EditProjectPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  const canUpdate = isSuperAdmin || userPermissions.includes('PROJECT_UPDATE');
  if (!canUpdate) {
    redirect(`/projects/${id}`);
  }

  return (
    <EditProjectClient
      projectId={id}
      currentUserId={user.id}
    />
  );
}
