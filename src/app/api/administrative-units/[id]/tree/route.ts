import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { administrativeUnitTreeService } from '../../../../../services/administrative-units';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/administrative-units/[id]/tree
 *
 * Retrieves hierarchical subtree rooted at the specified administrative unit.
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
    const subtree = await administrativeUnitTreeService.getUnitSubtree(id, user.id);

    return NextResponse.json(
      { success: true, data: subtree },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
