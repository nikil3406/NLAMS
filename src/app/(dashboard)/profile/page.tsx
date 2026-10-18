import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { ProfileClient } from './profile-client';

export const metadata = {
  title: 'My Profile | NLAMS',
  description: 'Manage your personal officer profile, contact details, and view jurisdictional assignments in NLAMS.',
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const roles = authContext?.roles ?? [];
  const assignments = authContext?.assignments ?? [];

  return (
    <ProfileClient
      user={user}
      roles={roles}
      assignments={assignments}
    />
  );
}
