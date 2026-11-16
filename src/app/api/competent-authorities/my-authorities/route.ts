import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { competentAuthorityRepository } from '../../../../repositories/competent-authority.repository';
import { permissionService } from '../../../../services/authorization/permission.service';

/**
 * GET /api/competent-authorities/my-authorities
 *
 * Returns active Competent Authorities that the current authenticated user is assigned to represent.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isSuper = await permissionService.isSuperAdmin(user.id);
    const hasCARole = await permissionService.hasRole(user.id, 'COMPETENT_AUTHORITY');
    if (!isSuper && !hasCARole) {
      return NextResponse.json(
        { success: true, data: [] },
        { status: 200 }
      );
    }

    const authorities = await competentAuthorityRepository.findActiveAuthoritiesForUser(user.id);

    return NextResponse.json(
      {
        success: true,
        data: authorities.map((a) => ({
          id: a.id,
          authorityCode: a.authorityCode,
          authorityName: a.authorityName,
          designation: a.designation,
          authorityLevel: a.authorityLevel,
          status: a.status,
          effectiveFrom: a.effectiveFrom,
          effectiveUntil: a.effectiveUntil,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

