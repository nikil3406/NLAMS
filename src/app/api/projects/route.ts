import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { projectService } from '../../../services/projects';
import { createProjectSchema, projectQuerySchema } from '../../../validators/projects';

/**
 * GET /api/projects
 *
 * Retrieves a paginated list of projects accessible to the authenticated user
 * within their authorized administrative scope.
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

    const { searchParams } = new URL(request.url);
    const queryParams: Record<string, string | undefined> = {};
    for (const [key, val] of searchParams.entries()) {
      if (val !== undefined && val !== '') {
        queryParams[key] = val;
      }
    }

    const parseResult = projectQuerySchema.safeParse(queryParams);
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

    const result = await projectService.listProjects(parseResult.data, user.id);

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/projects
 *
 * Creates a new project in DRAFT status.
 * Requires authentication, PROJECT_CREATE permission, and administrative scope over unit.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = createProjectSchema.safeParse(body);
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

    const created = await projectService.createProject(parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
