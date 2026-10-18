import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { userRoleService } from '../../../../../../services/users';

interface RouteContext {
  params: Promise<{ id: string; roleId: string }>;
}

/**
 * DELETE /api/users/[id]/roles/[roleId]
 *
 * Revokes an authorized role from a target user.
 * Requires ROLE_ASSIGN permission and role delegation authority.
 */
export async function DELETE(
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

    const { id, roleId } = await context.params;

    const updatedUser = await userRoleService.revokeRole(
      currentUser.id,
      id,
      roleId
    );

    return NextResponse.json(
      { success: true, data: updatedUser },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
