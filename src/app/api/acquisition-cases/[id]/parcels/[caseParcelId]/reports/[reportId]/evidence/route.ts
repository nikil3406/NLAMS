import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../../../services/field-verification-reports';
import { evidenceItemSchema } from '../../../../../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string; reportId: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/evidence
 *
 * Lists all evidence items attached to a field verification report.
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

    const evidenceList = await fieldVerificationReportService.listEvidence(
      id,
      caseParcelId,
      reportId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: evidenceList },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/evidence
 *
 * Attaches a new evidence item to a draft report.
 * Enforces:
 * - Authenticated user with FIELD_OFFICER role.
 * - Caller must be author of the draft report.
 * - Report must be in DRAFT status.
 * - Valid evidence type and fileReference.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const input = evidenceItemSchema.parse(body);
    const evidence = await fieldVerificationReportService.attachEvidence(
      id,
      caseParcelId,
      reportId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: evidence },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
