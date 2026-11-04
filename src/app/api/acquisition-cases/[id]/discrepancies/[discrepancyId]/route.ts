import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { discrepancyService } from '../../../../../../services/discrepancies';

interface RouteContext {
  params: Promise<{ id: string; discrepancyId: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/discrepancies/[discrepancyId]
 *
 * Retrieves an individual discrepancy by ID with full details, parcel info,
 * original triggering report, investigation history, and resolution decisions.
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

    const { id: caseId, discrepancyId } = await context.params;

    const discrepancy = await discrepancyService.getDiscrepancyById(
      caseId,
      discrepancyId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: discrepancy },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

