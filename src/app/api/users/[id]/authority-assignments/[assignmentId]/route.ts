import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { userService } from '../../../../../../services/users';
import { updateUserAuthorityAssignmentStatusSchema } from '../../../../../../validators/users';

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>;
}

/**
 * PATCH /api/users/[id]/authority-assignments/[assignmentId]
 *
 * Activates or deactivates a user's Competent Authority assignment.
 * Preserves historical records without deletion.
 * Requires USER_ASSIGN permission and management authority over target user.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id, assignmentId } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = updateUserAuthorityAssignmentStatusSchema.safeParse(body);
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

    const result = await userService.updateUserAuthorityAssignmentStatus(
      currentUser.id,
      id,
      assignmentId,
      parseResult.data
    );

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
