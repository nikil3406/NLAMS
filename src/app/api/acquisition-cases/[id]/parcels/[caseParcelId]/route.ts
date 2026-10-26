import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { parcelService } from '../../../../../../services/parcels';
import { parcelRepository } from '../../../../../../repositories/parcel.repository';
import { updateCaseParcelSchema } from '../../../../../../validators/parcels';
import { NotFoundError } from '../../../../../../types/errors';

interface RouteContext {
  params: Promise<{ id: string; caseParcelId: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/parcels/[caseParcelId]
 *
 * Retrieves details of a specific parcel associated with an acquisition case.
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

    const { id, caseParcelId } = await context.params;

    // Verify view access for case
    await parcelService.getCaseParcels(id, { page: 1, limit: 1 }, user.id);

    const caseParcel = await parcelRepository.findCaseParcelById(caseParcelId);
    if (!caseParcel || caseParcel.caseId !== id) {
      throw new NotFoundError(
        `Parcel association with ID '${caseParcelId}' not found for this acquisition case`
      );
    }

    return NextResponse.json(
      { success: true, data: caseParcel },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/acquisition-cases/[id]/parcels/[caseParcelId]
 *
 * Updates permitted case-specific parcel details (proposedAffectedArea, affectedAreaUnit).
 * Enforces:
 * - Authenticated user.
 * - ACQUISITION_CASE_VIEW permission.
 * - FIELD_OFFICER role restriction.
 * - Case must be in AWAITING_FIELD_VERIFICATION status.
 * - Proposed affected area <= total recorded parcel area.
 * - Does NOT overwrite canonical parcel recorded total area.
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

    const { id, caseParcelId } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const input = updateCaseParcelSchema.parse(body);
    const updated = await parcelService.updateCaseParcel(id, caseParcelId, input, user.id);

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
