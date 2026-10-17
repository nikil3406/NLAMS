import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import {
  administrativeUnitService,
  administrativeUnitTreeService,
} from '../../../services/administrative-units';
import { createAdministrativeUnitSchema } from '../../../validators/administrative-units';

/**
 * GET /api/administrative-units
 *
 * Query params:
 *   - tree: 'true' -> returns hierarchical tree structure
 *   - parentId: string -> returns immediate children of specified parent
 *   - activeOnly: 'false' -> include inactive units (default: true)
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
    const isTree = searchParams.get('tree') === 'true';
    const parentId = searchParams.get('parentId');

    if (isTree) {
      const tree = await administrativeUnitTreeService.getFullTree(user.id);
      return NextResponse.json({ success: true, data: tree }, { status: 200 });
    }

    if (parentId) {
      const children = await administrativeUnitService.getChildUnits(parentId, user.id);
      return NextResponse.json({ success: true, data: children }, { status: 200 });
    }

    const units = await administrativeUnitService.getAllUnits(user.id);
    return NextResponse.json({ success: true, data: units }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/administrative-units
 *
 * Creates a new administrative unit.
 * Requires authentication, ADMIN_UNIT_CREATE permission, and administrative scope.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = createAdministrativeUnitSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue?.message ?? 'Validation failed',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const created = await administrativeUnitService.createAdministrativeUnit(
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
