import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { acquisitionCaseService } from '../../../../services/acquisition-cases';
import { updateAcquisitionCaseSchema } from '../../../../validators/acquisition-cases';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]
 *
 * Retrieves acquisition case details if accessible within user's administrative scope.
 * Requires ACQUISITION_CASE_VIEW permission.
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
    const acqCase = await acquisitionCaseService.getCaseById(id, user.id);

    return NextResponse.json(
      { success: true, data: acqCase },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/acquisition-cases/[id]
 *
 * Updates permitted case fields only when case is in an editable state (DRAFT or RETURNED_FOR_CORRECTION).
 * Rejects status transitions, caseReference, projectId, or creator modifications.
 * Requires ACQUISITION_CASE_UPDATE permission and administrative scope.
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

    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = updateAcquisitionCaseSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue?.message ?? 'Validation failed',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const updated = await acquisitionCaseService.updateCase(id, parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
