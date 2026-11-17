import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';
import { recordDecisionSchema } from '../../../../../validators/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-proposals/[id]/decisions
 * Records a formal scrutiny decision (APPROVED, CORRECTION_REQUESTED, REJECTED).
 * Transactionally updates proposal status, creates workflow history, and persists decision.
 * Requires user to hold COMPETENT_AUTHORITY role with active assignment to this proposal's authority.
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

    const parseResult = recordDecisionSchema.safeParse(body);
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

    const result = await acquisitionProposalService.recordDecision(
      id,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: result.proposal,
        decision: result.decision,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
