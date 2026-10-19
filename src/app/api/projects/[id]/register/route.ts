import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { projectService } from '../../../../../services/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/register
 *
 * Dedicated endpoint for formally registering a DRAFT project.
 * Requires PROJECT_REGISTER permission and administrative scope.
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
    const registered = await projectService.registerProject(id, user.id);

    return NextResponse.json(
      { success: true, data: registered },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
