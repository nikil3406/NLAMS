import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../services/verified-land-inventory';

/**
 * GET /api/verified-land-inventories
 *
 * Lists submitted verified land inventories awaiting review for authorized Ministry users,
 * or lists scoped inventories with pagination & summary when query parameters (e.g. view=all, page, search) are provided.
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

    const { searchParams } = new URL(request.url);

    // If dashboard/list parameters are supplied, return scoped dashboard view
    if (
      searchParams.get('all') === 'true' ||
      searchParams.get('view') === 'all' ||
      searchParams.has('page') ||
      searchParams.has('search')
    ) {
      const page = searchParams.get('page')
        ? parseInt(searchParams.get('page')!, 10)
        : 1;
      const limit = searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!, 10)
        : 10;
      const status = searchParams.get('status') || undefined;
      const search = searchParams.get('search') || undefined;

      const result = await verifiedLandInventoryService.listDashboardInventories(
        user.id,
        { page, limit, status, search }
      );

      return NextResponse.json(
        {
          success: true,
          data: result.items,
          pagination: result.pagination,
          summary: result.summary,
        },
        { status: 200 }
      );
    }

    // Default: List submitted inventories for authorized Ministry users
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
