import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { permissionService } from '../../../../services/authorization/permission.service';
import { roleRepository } from '../../../../repositories/role.repository';

/**
 * GET /api/roles/all
 *
 * Returns all system roles with their full permission sets.
 * Accessible only to users holding ROLE_VIEW permission.
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

    const hasPermission = await permissionService.hasPermission(currentUser.id, 'ROLE_VIEW');
    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: missing required permission ROLE_VIEW' },
        { status: 403 }
      );
    }

    const roles = await roleRepository.findAllRolesWithPermissions();

    return NextResponse.json(
      { success: true, data: roles },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
