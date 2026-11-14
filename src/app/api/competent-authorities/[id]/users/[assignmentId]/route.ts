import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { competentAuthorityService } from '../../../../../../services/competent-authorities';
import { updateAuthorityUserAssignmentSchema } from '../../../../../../validators/competent-authorities';

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>;
}

/**
 * PATCH /api/competent-authorities/[id]/users/[assignmentId]
 * Updates a user assignment record. Requires Super Admin or Ministry Admin.
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

    const { assignmentId } = await context.params;
    const body = await request.json();

    const parseResult = updateAuthorityUserAssignmentSchema.safeParse(body);
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

    const updated = await competentAuthorityService.updateUserAssignment(
      assignmentId,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

