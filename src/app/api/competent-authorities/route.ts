import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { competentAuthorityService } from '../../../services/competent-authorities';
import { createAuthoritySchema } from '../../../validators/competent-authorities';

/**
 * GET /api/competent-authorities
 * Lists Competent Authorities with optional search, status, and level filters.
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

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const level = searchParams.get('level') ?? undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;
    const includeJurisdictions = searchParams.get('includeJurisdictions') === 'true';

    const result = await competentAuthorityService.listAuthorities({
      search,
      status,
      level,
      limit,
      offset,
      includeJurisdictions,
    });

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        total: result.total,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/competent-authorities
 * Creates a new Competent Authority. Requires Super Admin or Ministry Admin.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parseResult = createAuthoritySchema.safeParse(body);
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

    const created = await competentAuthorityService.createAuthority(
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

