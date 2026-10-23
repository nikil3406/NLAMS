import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionCaseService } from '../../../../../services/acquisition-cases';
import { submitAcquisitionCaseSchema } from '../../../../../validators/acquisition-cases';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/submit
 *
 * Dedicated transition endpoint for submitting a draft or returned case for review.
 * Enforces transition policy (DRAFT/RETURNED_FOR_CORRECTION -> SUBMITTED) and records
 * workflow history atomically.
 * Requires ACQUISITION_CASE_SUBMIT permission and administrative scope.
 */
export async function POST(
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

    let body: unknown = {};
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid JSON request body' },
          { status: 400 }
        );
      }
    }

    const parseResult = submitAcquisitionCaseSchema.safeParse(body);
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

    const submitted = await acquisitionCaseService.submitCase(id, parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: submitted },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
