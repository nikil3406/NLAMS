import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { projectService } from '../../../../../services/projects';
import { reviewProjectSchema } from '../../../../../validators/projects';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/review
 *
 * Dedicated review decision endpoint for registered/submitted projects.
 * Permitted transitions:
 *   - SUBMITTED -> ACCEPTED (decision: ACCEPT / APPROVE)
 *   - SUBMITTED -> Unlocked for correction (decision: REQUEST_CORRECTIONS / RETURN_FOR_CORRECTION)
 *   - SUBMITTED -> REJECTED (decision: REJECT)
 *
 * Enforces separation-of-duties and counterpart-role rules:
 *   - Created by PROJECT_OFFICER => Reviewer must have MINISTRY_ADMIN.
 *   - Created by MINISTRY_ADMIN => Reviewer must have PROJECT_OFFICER.
 *   - Project creator cannot review their own project.
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

    const parseResult = reviewProjectSchema.safeParse(body);
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

    const reviewed = await projectService.reviewProject(id, parseResult.data, user.id);

    return NextResponse.json(
      { success: true, data: reviewed },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
