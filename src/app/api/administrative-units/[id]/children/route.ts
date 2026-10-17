import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { administrativeUnitService } from '../../../../../services/administrative-units';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/administrative-units/[id]/children
 *
 * Retrieves immediate child administrative units for a specified parent unit.
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
    const children = await administrativeUnitService.getChildUnits(id, user.id);

    return NextResponse.json(
      { success: true, data: children },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
