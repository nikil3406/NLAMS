import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../../lib/auth';
import { handleApiError } from '../../../../../../../lib/api-response';
import { discrepancyService } from '../../../../../../../services/discrepancies';
import { resolveDiscrepancySchema } from '../../../../../../../validators/discrepancies';

interface RouteContext {
  params: Promise<{ id: string; discrepancyId: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/discrepancies/[discrepancyId]/resolve
 *
 * Records an authorized resolution decision on a submitted discrepancy.
 * Enforces:
 * - Authenticated Land Officer, Project Officer, or Super Admin with case scope.
 * - Separation of duties: Reviewer cannot be the investigator who submitted the findings.
 * - Discrepancy must be in SUBMITTED_FOR_RESOLUTION status.
 * - Mandatory remarks (min 5 chars).
 * - Decisions: RESOLVED, RETURNED_FOR_FURTHER_INVESTIGATION.
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

    const input = resolveDiscrepancySchema.parse(body);
    const resolved = await discrepancyService.resolveDiscrepancy(
      caseId,
      discrepancyId,
      input,
      user.id
    );

    return NextResponse.json(
      { success: true, data: resolved },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

