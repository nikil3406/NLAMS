import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { userService } from '../../../services/users';
import {
  createUserSchema,
  listUsersSchema,
} from '../../../validators/users';

/**
 * GET /api/users
 *
 * Lists users visible to the authenticated caller within their authorized administrative scope.
 * Supports pagination, text search, and filtering by status, role, and administrative unit.
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

    const { searchParams } = new URL(request.url);
    const rawQuery = {
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      roleId: searchParams.get('roleId') ?? undefined,
      administrativeUnitId: searchParams.get('administrativeUnitId') ?? undefined,
    };

    const parseResult = listUsersSchema.safeParse(rawQuery);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue?.message ?? 'Invalid query parameters',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await userService.listUsers(currentUser.id, parseResult.data);

    return NextResponse.json(
      {
        success: true,
        data: result.users,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users
 *
 * Creates a new user with an initial role and administrative unit assignment.
 * Requires USER_CREATE, ROLE_ASSIGN, USER_ASSIGN permissions and administrative authority.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const parseResult = createUserSchema.safeParse(body);
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

    const result = await userService.createUser(currentUser.id, parseResult.data);

    return NextResponse.json(
      {
        success: true,
        data: result.user,
        temporaryPassword: result.temporaryPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
