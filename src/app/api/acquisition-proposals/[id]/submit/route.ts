import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';
import { submitAcquisitionProposalSchema } from '../../../../../validators/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-proposals/[id]/submit
 *
 * Submits an acquisition proposal for Ministry review.
 *
 * Enforces:
 * - Authenticated user belongs to the authorized Implementing Agency for the project.
 * - Proposal must be in DRAFT status with current version in DRAFT status.
 * - Linked inventory must still be Ministry-approved ('APPROVED').
 * - Executes rule-based validation; rejects submission if blocking validation errors exist.
 * - Concurrency-safe atomic transaction.
 * - Version becomes immutable upon submission.
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

    const parseResult = submitAcquisitionProposalSchema.safeParse(body);
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

    const submitted = await acquisitionProposalService.submitProposal(
      id,
      user.id,
      parseResult.data.remarks
    );

    return NextResponse.json(
      { success: true, data: submitted },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

