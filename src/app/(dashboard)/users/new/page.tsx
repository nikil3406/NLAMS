import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { CreateUserClient } from './create-user-client';

export const metadata = {
  title: 'Create User | NLAMS',
  description: 'Create a new user with delegated role and administrative scope assignment in NLAMS.',
};

export default async function CreateUserPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  const canCreate = isSuperAdmin || userPermissions.includes('USER_CREATE');
  if (!canCreate) {
    redirect('/users');
  }

  return <CreateUserClient />;
}

