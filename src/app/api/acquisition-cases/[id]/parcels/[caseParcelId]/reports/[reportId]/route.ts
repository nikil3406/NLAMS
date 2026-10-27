import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../../services/field-verification-reports';
import { updateFieldVerificationReportSchema } from '../../../../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string; reportId: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]
 *
 * Retrieves a single report with its associated parcel and case references.
 * Enforces ACQUISITION_CASE_VIEW permission, administrative scope, and association match.
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

    const { id, caseParcelId, reportId } = await context.params;

    const report = await fieldVerificationReportService.getReportById(
      id,
      caseParcelId,
      reportId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: report },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]
 *
 * Updates an editable draft report.
 * Enforces:
 * - Authenticated user with FIELD_OFFICER role.
 * - Caller must be the original author of the draft report.
 * - Report must be in DRAFT status.
 * - Project within caller's administrative scope.
 * - Case in AWAITING_FIELD_VERIFICATION status.
 * - Client cannot modify status, author, timestamps, or audit fields.
 */
export async function PATCH(
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const input = updateFieldVerificationReportSchema.parse(body);
    const updated = await fieldVerificationReportService.updateDraftReport(
      id,
      caseParcelId,
      reportId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
