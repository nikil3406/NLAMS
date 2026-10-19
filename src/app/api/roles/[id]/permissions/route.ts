import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { permissionService } from '../../../../../services/authorization/permission.service';
import { roleRepository } from '../../../../../repositories/role.repository';
import { permissionRepository } from '../../../../../repositories/permission.repository';
import { NotFoundError } from '../../../../../types/errors';
import { z } from 'zod';

const addPermissionSchema = z.object({
  permissionId: z.string().uuid('Invalid permission ID'),
});

/**
 * POST /api/roles/[id]/permissions
 *
 * Grants a permission to a role.
 * Requires ROLE_ASSIGN permission and Super Admin authority.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: roleId } = await params;

    const body = await request.json();
    const parsed = addPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const role = await roleRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const permission = await permissionRepository.findAllPermissions().then((perms) =>
      perms.find((p) => p.id === parsed.data.permissionId)
    );
    if (!permission) {
      throw new NotFoundError('Permission not found');
    }

    await roleRepository.addPermissionToRole(roleId, parsed.data.permissionId);

    const updated = await roleRepository.findRoleWithPermissions(roleId);

    return NextResponse.json({ success: true, data: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
