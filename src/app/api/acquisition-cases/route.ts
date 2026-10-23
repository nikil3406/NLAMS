import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { acquisitionCaseService } from '../../../services/acquisition-cases';
import {
  createAcquisitionCaseSchema,
  acquisitionCaseQuerySchema,
} from '../../../validators/acquisition-cases';

/**
 * GET /api/acquisition-cases
 *
 * Lists acquisition cases visible within the user's authorized administrative scope.
 * Requires authentication and ACQUISITION_CASE_VIEW permission.
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
    const queryParams: Record<string, string | undefined> = {};
    for (const [key, val] of searchParams.entries()) {
      if (val !== undefined && val !== '') {
        queryParams[key] = val;
      }
    }

    const parseResult = acquisitionCaseQuerySchema.safeParse(queryParams);
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

    const result = await acquisitionCaseService.listCases(parseResult.data, user.id);

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

/**
 * POST /api/acquisition-cases
 *
 * Creates a new acquisition case in DRAFT status linked to an existing project.
 * Requires authentication, ACQUISITION_CASE_CREATE permission, and administrative scope over linked project.
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = createAcquisitionCaseSchema.safeParse(body);
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

    const created = await acquisitionCaseService.createCase(parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
