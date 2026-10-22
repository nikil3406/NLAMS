import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { handleApiError } from '../../../../lib/api-response';
import { projectBoundaryService } from '../../../../services/projects/project-boundary.service';
import { geoJsonGeometrySchema } from '../../../../validators/spatial';

/**
 * POST /api/projects/calculate-area
 *
 * Validates a GeoJSON Polygon / MultiPolygon and calculates ellipsoidal area via PostGIS.
 * Requires authenticated user.
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

    const payload = body as { geometry?: unknown };
    const parseResult = geoJsonGeometrySchema.safeParse(payload?.geometry ?? body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: issue?.message ?? 'Invalid geometry format',
          issues: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const measurement = await projectBoundaryService.validateAndMeasureGeometry(parseResult.data);

    const areaSqm = Number(measurement.areaSqm.toFixed(2));
    const areaHectares = Number((areaSqm / 10000).toFixed(4));
    const areaAcres = Number((areaSqm / 4046.8564224).toFixed(4));
    const areaSqKm = Number((areaSqm / 1000000).toFixed(4));

    return NextResponse.json(
      {
        success: true,
        data: {
          areaSqm,
          areaHectares,
          areaAcres,
          areaSqKm,
          geometryType: measurement.geometryType,
          isValid: measurement.isValid,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
