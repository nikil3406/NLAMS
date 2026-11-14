import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { acquisitionProposalService } from '../../../../../services/acquisition-proposals';
import { createProposalVersionSchema } from '../../../../../validators/acquisition-proposals';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]/versions
 *
 * Retrieves all versions and submission history for the specified proposal.
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

    const versions = await acquisitionProposalService.getProposalVersions(
      id,
      user.id
    );

    return NextResponse.json(
      { success: true, data: versions },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/acquisition-proposals/[id]/versions
 *
 * Creates the next draft version under the same proposal when in CORRECTION_REQUESTED status.
 *
 * Enforces:
 * - Authenticated user is an active Implementing Agency user.
 * - Proposal must be in 'CORRECTION_REQUESTED' status.
 * - Copies previous reviewed version into the new draft version.
 * - Preserves previous version content, timestamps, and history.
 * - Next version number is sequential.
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
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      // Body handling
    }

    const parseResult = createProposalVersionSchema.safeParse(body);
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

    const updated = await acquisitionProposalService.createNextVersion(
      id,
      user.id,
      parseResult.data.remarks
    );

    return NextResponse.json(
      { success: true, data: updated },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

