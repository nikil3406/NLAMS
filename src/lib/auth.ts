import type { NextRequest } from 'next/server';
import { authConfig } from '../config/auth';
import { authService, AuthenticationError } from '../services/auth';
import type { SafeUser } from '../types/auth';

/**
 * Retrieves the raw session token from incoming cookies.
 * Supports NextRequest (for route handlers/middleware) and next/headers (for server components).
 */
export async function getSessionToken(request?: NextRequest): Promise<string | null> {
  if (request) {
    return request.cookies.get(authConfig.cookieName)?.value ?? null;
  }

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    return cookieStore.get(authConfig.cookieName)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the currently authenticated user from the session cookie.
 * Returns null if unauthenticated, expired, or invalid.
 */
export async function getCurrentUser(request?: NextRequest): Promise<SafeUser | null> {
  const token = await getSessionToken(request);
  if (!token) {
    return null;
  }
  return authService.getAuthenticatedUser(token);
}

/**
 * Protected route helper: asserts that the current request is authenticated.
 * Throws AuthenticationError if unauthenticated.
 *
 * NOTE: This validates identity only ("Who are you?").
 * RBAC and permissions ("What can you do?") will be added in Step 4.
 */
export async function requireAuthentication(request?: NextRequest): Promise<SafeUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new AuthenticationError('Unauthorized');
  }
  return user;
}
