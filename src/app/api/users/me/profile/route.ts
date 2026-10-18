import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { userService } from '../../../../../services/users';
import { updateSelfProfileSchema } from '../../../../../validators/users';

/**
 * GET /api/users/me/profile
 *
 * Retrieves the authenticated user's own profile information.
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

    return NextResponse.json(
      { success: true, data: currentUser },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/users/me/profile
 *
 * Self-service personal profile update for the currently authenticated user.
 *
 * Security & Validation Constraints:
 * 1. The target user ID is derived strictly from the verified session (never accepted from client).
 * 2. Permits updating only personal identity attributes: name, email, phone.
 * 3. Strictly rejects privileged or administrative attributes (roles, permissions, administrative units, password, status).
 * 4. Checks email uniqueness against the entire user base (excluding caller).
 * 5. Returns sanitized SafeUser profile (never exposing password hash).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    // Explicitly reject if caller attempts to pass a user ID or target identity in body
    if (body && typeof body === 'object' && ('id' in body || 'userId' in body)) {
      return NextResponse.json(
        {
          success: false,
          error: 'User ID cannot be specified in self-service profile updates; identity is derived from session',
        },
        { status: 400 }
      );
    }

    const parseResult = updateSelfProfileSchema.safeParse(body);
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

    const updatedUser = await userService.updateSelfProfile(
      currentUser.id,
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
