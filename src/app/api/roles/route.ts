import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { userRoleService } from '../../../services/users';

/**
 * GET /api/roles
 *
 * Retrieves all roles that the authenticated caller is authorized to delegate.
 * Non-Super-Admins can only see and delegate roles within their delegated authority weight.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const roles = await userRoleService.getDelegatableRoles(currentUser.id);

    return NextResponse.json(
      { success: true, data: roles },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
