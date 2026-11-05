import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';

interface VerificationReviewsPageProps {
  searchParams?: Promise<{ caseId?: string }>;
}

export const metadata = {
  title: 'Field Verification Review | NLAMS',
  description: 'National Land Acquisition and Management System — Field Verification Review',
};

/**
 * Consolidated Route:
 * Field verification reviews have been unified into the acquisition case detail view.
 * Existing links or bookmarks pointing to /verification-reviews are safely redirected
 * to the corresponding acquisition case page when caseId is provided, or to /acquisition-cases.
 */
export default async function VerificationReviewsPage({
  searchParams,
}: VerificationReviewsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const params = searchParams ? await searchParams : {};
  if (params?.caseId) {
    redirect(`/acquisition-cases/${params.caseId}`);
  }

  redirect('/acquisition-cases');
}
