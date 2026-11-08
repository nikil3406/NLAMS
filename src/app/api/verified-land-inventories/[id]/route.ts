import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../../services/verified-land-inventory';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/verified-land-inventories/[id]
 *
 * Retrieves verified land inventory details and parcel snapshots.
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

    const inventory = await verifiedLandInventoryService.getInventory(
      id,
      user.id
    );

    return NextResponse.json(
      { success: true, data: inventory },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

