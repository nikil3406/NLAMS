import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';

/**
 * GET /api/auth/me
 *
 * Retrieves the profile of the currently authenticated user.
 * Returns 401 Unauthorized if unauthenticated, session expired, or user suspended.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          phone: user.phone,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
