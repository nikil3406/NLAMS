import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { userAssignmentService } from '../../../../../../services/users';
import { updateAssignmentSchema } from '../../../../../../validators/users';

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>;
}

/**
 * PATCH /api/users/[id]/assignments/[assignmentId]
 *
 * Updates an administrative assignment (e.g. status, endDate).
 * Requires USER_ASSIGN permission and administrative scope over the target unit.
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

    const parseResult = updateAssignmentSchema.safeParse(body);
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

    const updatedUser = await userAssignmentService.updateAssignment(
      currentUser.id,
      id,
      assignmentId,
      parseResult.data
    );

    return NextResponse.json(
      { success: true, data: updatedUser },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
