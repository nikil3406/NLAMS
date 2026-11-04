import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../../../services/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string; reportId: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/correct
 *
 * Initiates a new correction revision draft for a report in RETURNED_FOR_CORRECTION status.
 *
 * Enforces:
 * - Authenticated FIELD_OFFICER within administrative scope.
 * - Caller must be the original author of the returned report.
 * - Report must be in RETURNED_FOR_CORRECTION status.
 * - Preserves the previous submitted report and decision history.
 * - Creates a new revision draft (incremented revision number, linked via previousReportId).
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

    const revisionDraft = await fieldVerificationReportService.createCorrectionDraft(
      id,
      caseParcelId,
      reportId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: revisionDraft },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

