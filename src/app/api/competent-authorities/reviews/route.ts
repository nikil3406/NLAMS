import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../services/acquisition-proposals';

/**
 * GET /api/competent-authorities/reviews
 *
 * Competent Authority Proposal Review Dashboard API.
 *
 * Returns proposals submitted to Competent Authorities for scrutiny review.
 * Only accessible by authenticated users actively assigned to at least one Competent Authority.
 *
 * Query Parameters:
 * - authorityId: Optional filter for a specific authority context
 * - status: Filter by proposal status (SUBMITTED, UNDER_REVIEW, etc.)
 * - projectId: Filter by associated project
 * - caseId: Filter by acquisition case
 * - agencyId: Filter by implementing agency
 * - submittedFrom: Filter by start of submission date range (ISO string)
 * - submittedTo: Filter by end of submission date range (ISO string)
 * - search: Keyword search across proposal, case, project, and agency names
 * - page: Page number (default: 1)
 * - limit: Page size (default: 10, max: 100)
 * - sortBy: Sort field ('submissionDate', 'proposalNumber', 'status', 'projectName')
 * - sortOrder: Sort direction ('asc', 'desc', default: 'desc')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const authorityId = searchParams.get('authorityId') || undefined;
    const status = searchParams.get('status') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const caseId = searchParams.get('caseId') || undefined;
    const agencyId = searchParams.get('agencyId') || undefined;
    const submittedFrom = searchParams.get('submittedFrom') || undefined;
    const submittedTo = searchParams.get('submittedTo') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
    const sortBy = (searchParams.get('sortBy') as any) || 'submissionDate';
    const sortOrder = (searchParams.get('sortOrder') as any) || 'desc';

    const result = await acquisitionProposalService.listReviewProposals(user.id, {
      authorityId,
      status,
      projectId,
      caseId,
      agencyId,
      submittedFrom,
      submittedTo,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(
      {
        success: true,
        data: result.items,
        pagination: result.pagination,
        userAuthorities: result.userAuthorities,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

