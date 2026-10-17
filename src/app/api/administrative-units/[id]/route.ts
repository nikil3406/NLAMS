import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { administrativeUnitService } from '../../../../services/administrative-units';
import { updateAdministrativeUnitSchema } from '../../../../validators/administrative-units';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/administrative-units/[id]
 *
 * Retrieves unit details including ancestors breadcrumb, child count, and total descendants.
 * Requires ADMIN_UNIT_VIEW permission and administrative scope over unit.
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
    const unitDetails = await administrativeUnitService.getUnitById(id, user.id);

    return NextResponse.json(
      { success: true, data: unitDetails },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/administrative-units/[id]
 *
 * Updates an administrative unit.
 * Requires ADMIN_UNIT_UPDATE permission, administrative scope, and circular hierarchy checks.
 */
export async function PATCH(
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = updateAdministrativeUnitSchema.safeParse(body);
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

    const updated = await administrativeUnitService.updateAdministrativeUnit(
      id,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
