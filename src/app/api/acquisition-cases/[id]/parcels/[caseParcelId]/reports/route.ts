import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../lib/api-response';
import { fieldVerificationReportService } from '../../../../../../../services/field-verification-reports';
import {
  createFieldVerificationReportSchema,
  listFieldVerificationReportsQuerySchema,
} from '../../../../../../../validators/field-verification-reports';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports
 *
 * Lists all field verification reports for a specific parcel association.
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

    const { id, caseParcelId } = await context.params;

    const url = new URL(request.url);
    const queryParams: Record<string, string> = {};
    for (const [key, val] of url.searchParams.entries()) {
      queryParams[key] = val;
    }

    const validatedQuery = listFieldVerificationReportsQuerySchema.parse(queryParams);
    const result = await fieldVerificationReportService.listReportsForParcel(
      id,
      caseParcelId,
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

/**
 * POST /api/acquisition-cases/[id]/parcels/[caseParcelId]/reports
 *
 * Creates a new draft field verification report for a parcel association.
 * Enforces:
 * - Authenticated user with FIELD_OFFICER role.
 * - ACQUISITION_CASE_VIEW permission.
 * - Project within caller's administrative scope.
 * - Case in AWAITING_FIELD_VERIFICATION status.
 * - Server sets DRAFT status, createdBy, and timestamps.
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

    const { id, caseParcelId } = await context.params;

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

    const input = createFieldVerificationReportSchema.parse(body);
    const report = await fieldVerificationReportService.createDraftReport(
      id,
      caseParcelId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: report },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
