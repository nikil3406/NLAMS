import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionCaseService } from '../../../../../services/acquisition-cases';
import { reviewAcquisitionCaseSchema } from '../../../../../validators/acquisition-cases';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/acquisition-cases/[id]/review
 *
 * Dedicated review decision endpoint for submitted acquisition cases.
 * Permitted transitions:
 *   - SUBMITTED -> AWAITING_FIELD_VERIFICATION (decision: PERMIT_FIELD_VERIFICATION)
 *   - SUBMITTED -> RETURNED_FOR_CORRECTION     (decision: RETURN_FOR_CORRECTION)
 *   - SUBMITTED -> REJECTED                    (decision: REJECT)
 *
 * Requires authentication, ACQUISITION_CASE_REVIEW (or FIELD_VERIFICATION_AUTHORIZE for permitting field verification),
 * and authorized administrative scope over the case's linked project.
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

    const parseResult = reviewAcquisitionCaseSchema.safeParse(body);
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

    const reviewed = await acquisitionCaseService.reviewCase(id, parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: reviewed },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
