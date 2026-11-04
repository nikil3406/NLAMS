import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../services/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/verification-summary
 *
 * Retrieves the case-level summary of parcel verification progress.
 *
 * Derived metrics:
 * - Total parcels associated with case.
 * - Parcels with submitted reports.
 * - Reports awaiting review.
 * - Accepted reports.
 * - Returned reports.
 * - Discrepancy-flagged reports.
 * - Inconclusive findings.
 * - Recorded parcel area and proposed affected area totals (aggregated only when units are compatible).
 * - Outstanding review actions and discrepancies.
 * - Per-parcel current verification status based on the latest applicable revision.
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
    const summary = await fieldVerificationReportService.getCaseVerificationSummary(
      id,
      user.id
    );

    return NextResponse.json(
      { success: true, data: summary },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
