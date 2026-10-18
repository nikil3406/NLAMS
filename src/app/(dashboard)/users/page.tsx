import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { UsersClient } from './users-client';

export const metadata = {
  title: 'User Management | NLAMS',
  description: 'Manage users, authority scopes, and role assignments within the National Land Acquisition Management System.',
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <UsersClient
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}
