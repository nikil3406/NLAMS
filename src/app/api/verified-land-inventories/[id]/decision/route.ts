import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../../../services/verified-land-inventory';
import { inventoryDecisionSchema } from '../../../../../validators/verified-land-inventory';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/verified-land-inventories/[id]/decision
 *
 * Records a Ministry review decision (APPROVE, REQUEST_CORRECTIONS, REJECT).
 * Enforces:
 * - Active verified MINISTRY_ADMIN authority with administrative scope.
 * - Separation of duties: preparer cannot approve their own inventory.
 * - PROJECT_OFFICER, FIELD_OFFICER, and SUPER_ADMIN cannot approve without MINISTRY_ADMIN role.
 * - Inventory must be in SUBMITTED or UNDER_REVIEW status.
 * - Mandatory remarks on rejection or correction requests.
 * - Atomic database transition with audit logging.
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
      // Body handling
    }

    const parsed = inventoryDecisionSchema.parse(body);

    const updated = await verifiedLandInventoryService.reviewInventory(
      id,
      user.id,
      parsed.decision,
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
