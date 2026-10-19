import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { permissionService } from '../../../services/authorization/permission.service';
import { permissionRepository } from '../../../repositories/permission.repository';

/**
 * GET /api/permissions
 *
 * Returns all system permissions.
 * Requires ROLE_VIEW permission.
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

    const permissions = await permissionRepository.findAllPermissions();

    return NextResponse.json(
      { success: true, data: permissions },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
