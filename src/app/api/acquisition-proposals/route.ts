import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { handleApiError } from '../../../lib/api-response';
import { acquisitionProposalService } from '../../../services/acquisition-proposals';
import {
  createAcquisitionProposalSchema,
  acquisitionProposalQuerySchema,
} from '../../../validators/acquisition-proposals';

/**
 * GET /api/acquisition-proposals
 *
 * Lists acquisition proposals accessible to the authenticated user according to administrative scope.
 * Returns one record per proposal.
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

    const parseResult = acquisitionProposalQuerySchema.safeParse(queryParams);
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

    const result = await acquisitionProposalService.listProposals(
      parseResult.data,
      user.id
    );

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
 * POST /api/acquisition-proposals
 *
 * Creates a new acquisition proposal in DRAFT status with initial Version 1.
 * Requires:
 * - Authorized Implementing Agency user.
 * - Eligible acquisition case with project in REGISTERED status.
 * - Selected Ministry-approved Verified Land Inventory (status = 'APPROVED') belonging to the same case.
 * - Enforces one proposal per acquisition case.
 * - Concurrency-safe unique proposal number.
 * - Transactional creation.
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

    const parseResult = createAcquisitionProposalSchema.safeParse(body);
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

    const created = await acquisitionProposalService.createProposal(
      parseResult.data,
      user.id
    );

    return NextResponse.json(
      { success: true, data: created },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

