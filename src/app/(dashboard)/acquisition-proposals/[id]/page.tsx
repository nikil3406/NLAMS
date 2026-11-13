import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { ProposalDetailClient } from './proposal-detail-client';

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Acquisition Proposal Details | NLAMS',
  description: 'View land acquisition proposal details, version content and linked inventory',
};

export default async function ProposalDetailPage({ params }: ProposalPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const authContext =
    await authorizationService.getUserAuthorizationContext(user.id);
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <ProposalDetailClient
      proposalId={id}
      currentUserId={user.id}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
    />
  );
}

