import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]/history
 * Returns complete chronological audit history including versions,
 * workflow transitions, scrutiny decisions, and observations.
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
    const history = await acquisitionProposalService.getProposalHistory(id, user.id);

    return NextResponse.json(
      { success: true, data: history },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
