import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { fieldVerificationReportService } from '../../../services/field-verification-reports';
import { listReviewQueueQuerySchema } from '../../../validators/field-verification-reports';

/**
 * GET /api/field-verification-reviews
 *
 * Lists reports for the Land Officer review queue.
 *
 * Enforces:
 * - Authenticated Land Officer or Super Admin.
 * - Scoped to user's authorized administrative units.
 * - Strictly excludes DRAFT reports.
 * - Supports filtering by review status, outcome, caseId, with pagination.
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
    const query = listReviewQueueQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      reviewStatus: searchParams.get('reviewStatus') ?? undefined,
      outcome: searchParams.get('outcome') ?? undefined,
      caseId: searchParams.get('caseId') ?? undefined,
    });

    const result = await fieldVerificationReportService.listReviewQueue(
      query,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
