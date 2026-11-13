import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../../lib/auth';
import { EditProposalClient } from './edit-proposal-client';

interface EditProposalPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Edit Draft Proposal | NLAMS',
  description: 'Edit draft acquisition proposal content and supporting documentation',
};

export default async function EditProposalPage({ params }: EditProposalPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;

  return (
    <EditProposalClient
      proposalId={id}
      currentUserId={user.id}
    />
  );
}

