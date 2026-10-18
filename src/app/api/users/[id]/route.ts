import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { userService } from '../../../../services/users';
import { updateUserSchema } from '../../../../validators/users';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]
 *
 * Retrieves full details for a user (profile, roles, administrative assignments).
 * Requires USER_VIEW permission and scope accessibility.
 */
export async function GET(
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

    const { id } = await context.params;
    const userDetails = await userService.getUserDetails(currentUser.id, id);

    return NextResponse.json(
      { success: true, data: userDetails },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/users/[id]
 *
 * Updates permitted user profile fields (name, phone, status).
 * Requires USER_UPDATE permission and management authority.
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

    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = updateUserSchema.safeParse(body);
    if (!parseResult.success) {
      const personalInfoIssue = parseResult.error.issues.find((issue) =>
        ['name', 'email', 'phone'].some((field) => issue.path.includes(field))
      );
      const chosenIssue = personalInfoIssue ?? parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: chosenIssue?.message ?? 'Validation failed',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }


    const updatedUser = await userService.updateUser(
      currentUser.id,
      id,
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
