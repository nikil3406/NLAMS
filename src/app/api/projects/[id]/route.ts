import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { projectService } from '../../../../services/projects';
import { updateProjectSchema } from '../../../../validators/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]
 *
 * Retrieves project details if accessible within user's administrative scope.
 * Requires PROJECT_VIEW permission.
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
    const project = await projectService.getProjectById(id, user.id);

    return NextResponse.json(
      { success: true, data: project },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/projects/[id]
 *
 * Updates permitted project fields.
 * Rejects status changes and immutable identifiers.
 * Requires PROJECT_UPDATE permission and administrative scope.
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

    const parseResult = updateProjectSchema.safeParse(body);
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

    const updated = await projectService.updateProject(id, parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
