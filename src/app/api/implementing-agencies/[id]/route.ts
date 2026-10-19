import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { implementingAgencyService } from '../../../../services/implementing-agencies';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/implementing-agencies/[id]
 *
 * Retrieves safe agency catalogue information including official source URL and parent hierarchy.
 * Read-only endpoint.
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
    const agency = await implementingAgencyService.getAgencyById(id);

    return NextResponse.json(
      { success: true, data: agency },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
