import { userRepository } from '../../repositories/user.repository';
import { passwordService } from './password.service';
import { sessionService, sanitizeUser } from './session.service';
import type { LoginInput } from '../../validators/auth/login.schema';
import type { SafeUser } from '../../types/auth';

/**
 * Custom error thrown during authentication failures.
 * Keeps failure messages generic to prevent email enumeration.
 */
export class AuthenticationError extends Error {
  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Dummy hash to execute against when user does not exist, mitigating timing attacks.
// Generated with the exact same Argon2id parameters as the application.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9v9n3nK2i2C6y1J2Y4u4z5A6B7C8D9E0F1G2H3I4J5K';

/**
 * Authentication service coordinating credential validation, session creation,
 * and user retrieval.
 */
export class AuthService {
  /**
   * Authenticates user credentials and provisions a new session.
   * Throws AuthenticationError if invalid.
   */
  async authenticateUser(
    credentials: LoginInput
  ): Promise<{ user: SafeUser; sessionToken: string }> {
    const user = await userRepository.findUserByEmail(credentials.email);

    if (!user) {
      // Execute dummy verification to preserve consistent response timing
      await passwordService.verifyPassword(credentials.password, DUMMY_HASH).catch(() => false);
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      // Return identical error message so existence of suspended account is not leaked
      await passwordService.verifyPassword(credentials.password, DUMMY_HASH).catch(() => false);
      throw new AuthenticationError('Invalid email or password');
    }

    const isValidPassword = await passwordService.verifyPassword(
      credentials.password,
      user.passwordHash
    );

    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    const { token: sessionToken } = await sessionService.createSession(user.id);

    return {
      user: sanitizeUser(user),
      sessionToken,
    };
  }

  /**
   * Retrieves the currently authenticated user from a session token.
   * Returns null if the token is invalid, expired, or user is inactive.
   */
  async getAuthenticatedUser(sessionToken?: string | null): Promise<SafeUser | null> {
    if (!sessionToken) {
      return null;
    }

    const validated = await sessionService.validateSession(sessionToken);
    return validated?.user ?? null;
  }

  /**
   * Invalidates and destroys the current session.
   * Safe to call multiple times or with null/undefined.
   */
  async logoutUser(sessionToken?: string | null): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await sessionService.destroySession(sessionToken);
  }
}

export const authService = new AuthService();
