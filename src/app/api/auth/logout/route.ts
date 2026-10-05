import { NextResponse, type NextRequest } from 'next/server';
import { getSessionToken } from '../../../../lib/auth';
import { authService } from '../../../../services/auth';
import { authConfig } from '../../../../config/auth';

/**
 * POST /api/auth/logout
 *
 * Invalidates the active server-side session and clears the session cookie.
 * Safe to call idempotently (even if already logged out).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = await getSessionToken(request);

    if (token) {
      await authService.logoutUser(token);
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully',
      },
      { status: 200 }
    );

    response.cookies.set({
      name: authConfig.cookieName,
      value: '',
      httpOnly: authConfig.cookie.httpOnly,
      secure: authConfig.cookie.secure,
      sameSite: authConfig.cookie.sameSite,
      path: authConfig.cookie.path,
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch {
    const response = NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully',
      },
      { status: 200 }
    );

    response.cookies.set({
      name: authConfig.cookieName,
      value: '',
      httpOnly: authConfig.cookie.httpOnly,
      secure: authConfig.cookie.secure,
      sameSite: authConfig.cookie.sameSite,
      path: authConfig.cookie.path,
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  }
}
