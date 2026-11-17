import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';
import { createObservationSchema } from '../../../../../validators/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]/observations
 * Lists scrutiny observations recorded for a proposal.
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
    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId') || undefined;

    const observations = await acquisitionProposalService.listObservations(
      id,
      versionId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: observations },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/acquisition-proposals/[id]/observations
 * Records a scrutiny observation against the proposal's current version.
 * Requires user to hold COMPETENT_AUTHORITY role with active assignment.
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
    const body = await request.json();

    const parseResult = createObservationSchema.safeParse(body);
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

    const created = await acquisitionProposalService.recordObservation(
      id,
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
