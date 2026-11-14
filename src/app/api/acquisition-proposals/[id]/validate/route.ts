import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-proposals/[id]/validate
 *
 * Runs deterministic rule-based validation on the acquisition proposal
 * against the linked Ministry-approved Verified Land Inventory version.
 *
 * Checks:
 * - Proposal completeness
 * - Inventory consistency
 * - Area and parcel consistency
 * - Document validation
 *
 * Returns structured validation results with overall result (PASSED, FAILED, WARNING),
 * individual check statuses, missing information, and recommended actions.
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

    let targetVersionId: string | undefined;
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        const body = JSON.parse(text);
        if (body && typeof body.versionId === 'string') {
          targetVersionId = body.versionId;
        }
      }
    } catch {
      // Body is optional
    }

    const report = await acquisitionProposalService.validateProposal(
      id,
      user.id,
      targetVersionId
    );

    return NextResponse.json(
      { success: true, data: report },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

