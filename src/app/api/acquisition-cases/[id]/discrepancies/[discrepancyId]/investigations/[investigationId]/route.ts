import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../../lib/api-response';
import { discrepancyService } from '../../../../../../../../services/discrepancies';
import { updateInvestigationSchema } from '../../../../../../../../validators/discrepancies';

interface RouteContext {
  params: Promise<{ id: string; discrepancyId: string; investigationId: string }>;
}

/**
 * PATCH /api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/[investigationId]
 *
 * Updates draft findings or notes for an ongoing investigation.
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

    const { id: caseId, discrepancyId, investigationId } = await context.params;

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

    const input = updateInvestigationSchema.parse(body);
    const updated = await discrepancyService.updateInvestigation(
      caseId,
      discrepancyId,
      investigationId,
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

