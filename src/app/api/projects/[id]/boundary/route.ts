import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { projectBoundaryService } from '../../../../../services/projects/project-boundary.service';
import { projectBoundaryInputSchema } from '../../../../../validators/spatial';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/boundary
 *
 * Retrieves the latest boundary version (or version history if ?history=true).
 * Requires authentication, PROJECT_VIEW permission, and administrative scope.
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
    const history = searchParams.get('history') === 'true';

    if (history) {
      const versions = await projectBoundaryService.getBoundaryHistory(id, user.id);
      return NextResponse.json(
        { success: true, data: versions },
        { status: 200 }
      );
    }

    const boundary = await projectBoundaryService.getLatestBoundary(id, user.id);
    return NextResponse.json(
      { success: true, data: boundary },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/projects/[id]/boundary
 *
 * Appends a new boundary version for a project.
 * Requires authentication, PROJECT_UPDATE permission, and administrative scope.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = projectBoundaryInputSchema.safeParse(body);
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

    const saved = await projectBoundaryService.saveBoundaryVersion(
      id,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      { success: true, data: saved },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
