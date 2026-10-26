import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { projectService } from '../../../../../services/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/resubmit
 *
 * Called by the original project creator after addressing a correction request.
 * Clears the correctionPendingFor flag, ending the creator-editable correction window.
 * The Land Officer can then resubmit the linked acquisition case for fresh review.
 *
 * Requires PROJECT_UPDATE permission and must be the original project creator.
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
    const updated = await projectService.resubmitAfterCorrection(id, user.id);

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
