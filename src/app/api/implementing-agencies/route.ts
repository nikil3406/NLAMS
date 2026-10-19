import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { implementingAgencyService } from '../../../services/implementing-agencies';

/**
 * GET /api/implementing-agencies
 *
 * Query params:
 *   - search: string (matches name or code)
 *   - type: string (agency type)
 *   - status: string ('ACTIVE' | 'INACTIVE')
 *   - activeOnly: 'true' | 'false' (defaults to false, or true if specified)
 *   - page: number (default: 1)
 *   - limit: number (default: 20)
 *
 * Read-only catalogue endpoint.
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
    const type = searchParams.get('type') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20;

    const result = await implementingAgencyService.listAgencies({
      search,
      type,
      status,
      activeOnly,
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 20 : limit,
    });

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
