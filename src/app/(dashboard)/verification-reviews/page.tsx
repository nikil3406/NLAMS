import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { VerificationReviewsClient } from './verification-reviews-client';

export const metadata = {
  title: 'Field Verification Review Queue | NLAMS',
  description: 'National Land Acquisition and Management System — Field Verification Review Queue',
};

export default async function VerificationReviewsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <VerificationReviewsClient
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}

