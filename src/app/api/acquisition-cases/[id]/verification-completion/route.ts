import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { fieldVerificationCompletionService } from '../../../../../services/acquisition-cases';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-cases/[id]/verification-completion
 *
 * Returns completion eligibility and detailed unmet requirements for an acquisition case.
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

    // Check scope & access
    await fieldVerificationCompletionService.assertAuthorizedCompletingOfficer(id, user.id);

    // Validate eligibility
    const eligibility = await fieldVerificationCompletionService.validateCaseCompletion(id);

    return NextResponse.json(
      { success: true, data: eligibility },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/acquisition-cases/[id]/verification-completion
 *
 * Formally completes field verification for an acquisition case.
 * Enforces:
 * - Active verified LAND_OFFICER authority with administrative scope.
 * - All business rules satisfied (reports accepted, discrepancies resolved, evidence satisfied).
 * - Atomic database transaction with row locking and audit logging.
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

    let body: any = {};
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      // Body optional or remarks in payload
    }

    const result = await fieldVerificationCompletionService.completeFieldVerification(
      id,
      body?.remarks,
      user.id
    );

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
