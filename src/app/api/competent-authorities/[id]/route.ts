import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { competentAuthorityService } from '../../../../services/competent-authorities';
import { updateAuthoritySchema } from '../../../../validators/competent-authorities';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/competent-authorities/[id]
 * Retrieves details of a Competent Authority.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const authority = await competentAuthorityService.getAuthorityById(id);

    return NextResponse.json(
      {
        success: true,
        data: authority,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/competent-authorities/[id]
 * Updates a Competent Authority. Requires Super Admin or Ministry Admin.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const parseResult = updateAuthoritySchema.safeParse(body);
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

    const updated = await competentAuthorityService.updateAuthority(
      id,
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

