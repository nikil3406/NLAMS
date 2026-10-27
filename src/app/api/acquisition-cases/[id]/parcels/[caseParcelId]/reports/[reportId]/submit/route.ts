import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../../../services/field-verification-reports';
import { submitFieldVerificationReportSchema } from '../../../../../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string; reportId: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/submit
 *
 * Submits a draft report for Land Officer review.
 * Enforces:
 * - Authenticated user with FIELD_OFFICER role.
 * - Caller must be the original author of the draft report.
 * - Report must be in DRAFT status.
 * - Mandatory inspection fields (date, outcome, non-empty observations).
 * - Measured area validation (positive, explicit unit).
 * - Mandatory linked evidence (at least 1 item).
 * - Concurrency safe transition to SUBMITTED.
 * - Sets verifiedBy and submittedAt from server context.
 * - Case remains in AWAITING_FIELD_VERIFICATION status.
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

    const input = submitFieldVerificationReportSchema.parse(body);
    const submitted = await fieldVerificationReportService.submitReport(
      id,
      caseParcelId,
      reportId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: submitted },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
