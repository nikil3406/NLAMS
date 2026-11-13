import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../services/acquisition-proposals';

/**
 * GET /api/acquisition-proposals/eligible-cases
 *
 * Lists eligible acquisition cases that:
 * - Belong to a REGISTERED project within the user's scope.
 * - Have at least one Ministry-approved Verified Land Inventory (status = 'APPROVED').
 * - Do NOT already have an acquisition proposal.
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

    const eligibleCases =
      await acquisitionProposalService.listEligibleCasesForProposal(user.id);

    return NextResponse.json(
      { success: true, data: eligibleCases },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

