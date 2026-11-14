import React from 'react';
import { getCurrentUser } from '../../../../lib/auth';
import { redirect } from 'next/navigation';
import { ReviewsClient } from './reviews-client';

export const metadata = {
  title: 'Competent Authority Reviews | NLAMS',
  description: 'Review and scrutinize submitted acquisition proposals',
};

export default async function CompetentAuthorityReviewsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/login');
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <ReviewsClient currentUserId={user.id} />
    </div>
  );
}

