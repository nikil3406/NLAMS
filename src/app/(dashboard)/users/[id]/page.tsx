import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { UserDetailsClient } from './user-details-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'User Profile & Authority | NLAMS',
  description: 'View user profile, assigned system roles, and administrative assignments in NLAMS.',
};

export default async function UserDetailsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <UserDetailsClient
      userId={id}
      currentUserId={user.id}
      userPermissions={userPermissions}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
