import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../services/field-verification-reports';
import { listFieldVerificationReportsQuerySchema } from '../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/reports
 *
 * Lists all field verification reports for an acquisition case across all associated parcels.
 * Enforces ACQUISITION_CASE_VIEW permission and administrative scope.
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

    const { id } = await context.params;

    const url = new URL(request.url);
    const queryParams: Record<string, string> = {};
    for (const [key, val] of url.searchParams.entries()) {
      queryParams[key] = val;
    }

    const validatedQuery = listFieldVerificationReportsQuerySchema.parse(queryParams);
    const result = await fieldVerificationReportService.listReportsForCase(
      id,
      validatedQuery,
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
