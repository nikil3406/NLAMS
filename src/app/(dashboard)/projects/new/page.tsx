import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { CreateProjectClient } from './create-project-client';

export const metadata = {
  title: 'Create Project | NLAMS',
  description: 'Initiate a new public infrastructure and land acquisition project in NLAMS.',
};

export default async function CreateProjectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  const canCreate = isSuperAdmin || userPermissions.includes('PROJECT_CREATE');
  if (!canCreate) {
    redirect('/projects');
  }

  return <CreateProjectClient />;
}
