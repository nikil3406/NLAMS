import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../lib/api-response';
import { discrepancyService } from '../../../../../../../services/discrepancies';
import { startInvestigationSchema } from '../../../../../../../validators/discrepancies';

interface RouteContext {
  params: Promise<{ id: string; discrepancyId: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations
 *
 * Starts an investigation or assigns an investigator to a discrepancy.
 * Transitions discrepancy status from OPEN to UNDER_INVESTIGATION.
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

    const { id: caseId, discrepancyId } = await context.params;

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

    const input = startInvestigationSchema.parse(body);
    const result = await discrepancyService.startInvestigation(
      caseId,
      discrepancyId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

