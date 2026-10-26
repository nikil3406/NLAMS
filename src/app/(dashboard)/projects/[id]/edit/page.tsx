import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../../lib/auth';
import { authorizationService } from '../../../../../services/authorization';
import { projectService } from '../../../../../services/projects';
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

  // Strict ownership check: only the project creator may edit the project
  try {
    const project = await projectService.getProjectById(id, user.id);
    if (project.createdBy !== user.id) {
      redirect(`/projects/${id}`);
    }
    const isUnderCorrection = Boolean(project.correctionPendingFor);
    if (project.status !== 'DRAFT' && !isUnderCorrection) {
      redirect(`/projects/${id}`);
    }
  } catch {
    redirect(`/projects/${id}`);
  }

  return (
    <EditProjectClient
      projectId={id}
      currentUserId={user.id}
    />
  );
}
