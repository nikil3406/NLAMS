import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { verifiedLandInventoryService } from '../../../../../services/verified-land-inventory';
import { generateInventorySchema } from '../../../../../validators/verified-land-inventory';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/inventories
 *
 * Generates or regenerates a verified land inventory for an eligible acquisition case.
 * Enforces:
 * - Active verified LAND_OFFICER authority with administrative scope.
 * - Field verification completion verified.
 * - All case parcels verified with accepted reports and attached evidence.
 * - All discrepancies formally resolved.
 * - Atomic database transaction with row locking and snapshot creation.
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

    const parsed = generateInventorySchema.parse(body);

    const inventory = await verifiedLandInventoryService.generateInventory(
      id,
      user.id,
      parsed.remarks
    );

    return NextResponse.json(
      { success: true, data: inventory },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/acquisition-cases/[id]/inventories
 *
 * Lists all inventory versions for an acquisition case.
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

    const versions = await verifiedLandInventoryService.listInventoryVersions(
      id,
      user.id
    );

    return NextResponse.json(
      { success: true, data: versions },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
