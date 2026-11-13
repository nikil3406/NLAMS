import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../services/acquisition-proposals';
import { updateAcquisitionProposalSchema } from '../../../../validators/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]
 *
 * Retrieves proposal details and its current editable version,
 * including linked project, acquisition case, and approved inventory summary.
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

    const proposal = await acquisitionProposalService.getProposalById(
      id,
      user.id
    );

    return NextResponse.json(
      { success: true, data: proposal },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/acquisition-proposals/[id]
 *
 * Updates an initial draft proposal.
 * Enforces:
 * - Only the original authorized Implementing Agency creator can edit.
 * - Only DRAFT proposals can be edited.
 * - Does not allow changes to the proposal's acquisition case or linked inventory.
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

    const parseResult = updateAcquisitionProposalSchema.safeParse(body);
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

    const updated = await acquisitionProposalService.updateDraftProposal(
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

