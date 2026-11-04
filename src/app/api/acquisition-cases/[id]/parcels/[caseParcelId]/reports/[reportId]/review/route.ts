import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../../../services/field-verification-reports';
import { reviewFieldVerificationReportSchema } from '../../../../../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string; reportId: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/review
 *
 * Records a Land Officer review workflow decision on a submitted field verification report.
 *
 * Enforces:
 * - Authenticated Land Officer with case scope.
 * - Separation of duties: Reviewer cannot be the author or verifier of the report.
 * - Report must be in SUBMITTED status.
 * - Enforces mandatory remarks for RETURNED_FOR_CORRECTION and DISCREPANCY_FLAGGED.
 * - Atomically updates status, reviewedBy, reviewedAt, reviewDecision, and appends to audit history.
 */
export async function POST(
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

    const { id, caseParcelId, reportId } = await context.params;

    let body: unknown = {};
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const input = reviewFieldVerificationReportSchema.parse(body);
    const reviewed = await fieldVerificationReportService.reviewReport(
      id,
      caseParcelId,
      reportId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: reviewed },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

