import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { competentAuthorityService } from '../../../../services/competent-authorities';

/**
 * GET /api/competent-authorities/eligible?caseId=...
 * Discovers eligible Competent Authorities for an Acquisition Case.
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
    const caseId = searchParams.get('caseId');

    if (!caseId) {
      return NextResponse.json(
        { success: false, error: 'Query parameter caseId is required' },
        { status: 400 }
      );
    }

    const result = await competentAuthorityService.getEligibleAuthoritiesForCase(caseId);

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

