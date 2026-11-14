import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { handleApiError } from '../../../../../lib/api-response';
import { competentAuthorityService } from '../../../../../services/competent-authorities';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/acquisition-proposals/[id]/eligible-authorities
 * Discovers eligible Competent Authorities for an existing acquisition proposal.
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
    const result = await competentAuthorityService.getEligibleAuthoritiesForProposal(id);

    return NextResponse.json(
      {
        success: true,
        data: result.authorities,
        isMultiDistrict: result.isMultiDistrict,
        affectedDistricts: result.affectedDistricts,
        affectedStates: result.affectedStates,
        totalParcels: result.totalParcels,
        notice: result.notice,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

