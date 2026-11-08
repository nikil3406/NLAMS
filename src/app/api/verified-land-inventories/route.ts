import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../services/verified-land-inventory';

/**
 * GET /api/verified-land-inventories
 *
 * Lists submitted verified land inventories awaiting review for authorized Ministry users.
 * Enforces:
 * - Active verified MINISTRY_ADMIN authority.
 * - Scoped to user's authorized administrative units.
 * - Returns only SUBMITTED and UNDER_REVIEW inventories.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const items = await verifiedLandInventoryService.listSubmittedInventories(
      user.id
    );

    return NextResponse.json(
      { success: true, data: items },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

