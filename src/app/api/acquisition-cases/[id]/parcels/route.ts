import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { parcelService } from '../../../../../services/parcels';
import {
  parseAddParcelInput,
  caseParcelsQuerySchema,
} from '../../../../../validators/parcels';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/parcels
 *
 * Lists parcels associated with an acquisition case.
 * Enforces ACQUISITION_CASE_VIEW permission and administrative scope.
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

    const url = new URL(request.url);
    const queryParams: Record<string, string> = {};
    for (const [key, val] of url.searchParams.entries()) {
      queryParams[key] = val;
    }

    const validatedQuery = caseParcelsQuerySchema.parse(queryParams);
    const result = await parcelService.getCaseParcels(id, validatedQuery, user.id);

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/acquisition-cases/[id]/parcels
 *
 * Associates an existing parcel or creates and associates a new canonical parcel.
 * Enforces:
 * - Authenticated user.
 * - ACQUISITION_CASE_VIEW permission.
 * - FIELD_OFFICER role restriction (separation of duties).
 * - Case must be in AWAITING_FIELD_VERIFICATION status.
 * - Locality-aware deduplication and transaction safeguards.
 * - Proposed affected area <= total recorded parcel area.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const input = parseAddParcelInput(body);
    const created = await parcelService.addParcelToCase(id, input, user.id);

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
