import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '../../../../validators/auth';
import { authService, AuthenticationError } from '../../../../services/auth';
import { authConfig } from '../../../../config/auth';

/**
 * POST /api/auth/login
 *
 * Authenticates user credentials, generates a server-side session,
 * and sets an HttpOnly cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON request body',
        },
        { status: 400 }
      );
    }

    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { user, sessionToken } = await authService.authenticateUser(validationResult.data);

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
        },
      },
      { status: 200 }
    );

    response.cookies.set({
      name: authConfig.cookieName,
      value: sessionToken,
      httpOnly: authConfig.cookie.httpOnly,
      secure: authConfig.cookie.secure,
      sameSite: authConfig.cookie.sameSite,
      path: authConfig.cookie.path,
      maxAge: authConfig.sessionDurationDays * 86400,
      expires: new Date(Date.now() + authConfig.sessionDurationMs),
    });

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        { status: 401 }
      );
    }

    // Never leak stack trace or internal database details to client
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred during authentication',
      },
      { status: 500 }
    );
  }
}
