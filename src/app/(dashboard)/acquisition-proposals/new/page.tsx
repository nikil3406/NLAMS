import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { NewProposalClient } from './new-proposal-client';

export const metadata = {
  title: 'Prepare Land Acquisition Proposal | NLAMS',
  description:
    'Prepare and save draft land acquisition proposal for an eligible acquisition case',
};

export default async function NewProposalPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext =
    await authorizationService.getUserAuthorizationContext(user.id);
  const userRoles = authContext?.roles ?? [];

  const isAgencyUser =
    userRoles.includes('IMPLEMENTING_AGENCY') ||
    userRoles.includes('PROJECT_OFFICER');

  if (!isAgencyUser) {
    redirect('/acquisition-proposals');
  }

  return (
    <NewProposalClient
      currentUserId={user.id}
      userRoles={userRoles}
    />
  );
}

