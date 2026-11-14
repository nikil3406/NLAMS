import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../../services/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]/versions/[versionId]
 *
 * Retrieves an individual proposal version and its associated details,
 * substantive content, and supporting documents.
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

    const { id, versionId } = await context.params;

    const version = await acquisitionProposalService.getProposalVersionById(
      id,
      versionId,
      user.id
    );

    return NextResponse.json(
      { success: true, data: version },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

