import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { competentAuthorityService } from '../../../../../services/competent-authorities';
import { assignAuthorityUserSchema } from '../../../../../validators/competent-authorities';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/competent-authorities/[id]/users
 * Lists user assignments for a Competent Authority.
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
    const assignments = await competentAuthorityService.listUserAssignments(id);

    return NextResponse.json(
      {
        success: true,
        data: assignments,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/competent-authorities/[id]/users
 * Assigns an authorized user to a Competent Authority. Requires Super Admin or Ministry Admin.
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

    const parseResult = assignAuthorityUserSchema.safeParse(body);
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

    const created = await competentAuthorityService.assignUser(
      id,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

