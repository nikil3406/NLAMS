import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../../../services/verified-land-inventory';
import { submitInventorySchema } from '../../../../../validators/verified-land-inventory';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/verified-land-inventories/[id]/submit
 *
 * Submits a draft verified land inventory for Ministry review.
 * Enforces:
 * - Active verified LAND_OFFICER authority with administrative scope.
 * - Inventory must be in DRAFT status.
 * - Atomic database transition to SUBMITTED.
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

    const { id } = await context.params;

    let body: unknown = {};
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      // Body is optional
    }

    const parsed = submitInventorySchema.parse(body);

    const updated = await verifiedLandInventoryService.submitInventory(
      id,
      user.id,
      parsed.remarks
    );

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
