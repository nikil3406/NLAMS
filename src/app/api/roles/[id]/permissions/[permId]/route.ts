import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { handleApiError } from '../../../../../../lib/api-response';
import { permissionService } from '../../../../../../services/authorization/permission.service';
import { roleRepository } from '../../../../../../repositories/role.repository';
import { NotFoundError } from '../../../../../../types/errors';

/**
 * DELETE /api/roles/[id]/permissions/[permId]
 *
 * Revokes a permission from a role.
 * Requires Super Admin authority.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; permId: string }> }
): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = await permissionService.isSuperAdmin(currentUser.id);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: only Super Admins can modify role permissions' },
        { status: 403 }
      );
    }

    const { id: roleId, permId } = await params;

    const role = await roleRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const removed = await roleRepository.removePermissionFromRole(roleId, permId);
    if (!removed) {
      throw new NotFoundError('Role does not have this permission');
    }

    const updated = await roleRepository.findRoleWithPermissions(roleId);

    return NextResponse.json({ success: true, data: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
