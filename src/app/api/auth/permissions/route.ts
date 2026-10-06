import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';

/**
 * GET /api/auth/permissions
 *
 * Returns the complete authorization context for the currently authenticated user.
 * Demonstrates that authentication and authorization work together:
 *
 *   1. Requires authentication (401 if missing/expired)
 *   2. Resolves user roles via RBAC
 *   3. Resolves user permissions from assigned roles
 *   4. Resolves administrative assignments
 *
 * Used to validate Step 4 authorization foundation is operational.
 * Does NOT expose passwords, hashes, or session secrets.
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

    const authContext = await authorizationService.getUserAuthorizationContext(user.id);

    if (!authContext) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        authorization: {
          user: {
            id: authContext.user.id,
            name: authContext.user.name,
            email: authContext.user.email,
            status: authContext.user.status,
          },
          roles: authContext.roles,
          permissions: authContext.permissions,
          assignments: authContext.assignments,
          isSuperAdmin: authContext.isSuperAdmin,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
