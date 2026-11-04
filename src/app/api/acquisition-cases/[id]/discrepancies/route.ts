import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { discrepancyService } from '../../../../../services/discrepancies';
import { listDiscrepanciesQuerySchema } from '../../../../../validators/discrepancies';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/discrepancies
 *
 * Lists formally tracked discrepancies for an acquisition case.
 * Enforces:
 * - Authentication & ACQUISITION_CASE_VIEW permission.
 * - Project administrative scope check.
 * - Filtering by status, category, and caseParcelId.
 * - Pagination.
 * - Returns case discrepancy counts.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: caseId } = await context.params;
    const { searchParams } = new URL(request.url);

    const query = listDiscrepanciesQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      caseParcelId: searchParams.get('caseParcelId') ?? undefined,
    });

    const result = await discrepancyService.listDiscrepancies(
      caseId,
      query,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
        counts: result.counts,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

