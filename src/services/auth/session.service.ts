import { randomBytes, createHash } from 'node:crypto';
import { sessionRepository } from '../../repositories/session.repository';
import { authConfig } from '../../config/auth';
import type { Session } from '../../../db/schema/sessions';
import type { User } from '../../../db/schema/users';
import type { SafeUser } from '../../types/auth';

/**
 * Sanitizes a user record by removing sensitive security fields (passwordHash).
 */
export function sanitizeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Hashes a raw session token using SHA-256 for secure database storage.
 */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Service managing session lifecycles, hashing tokens, and validating active sessions.
 */
export class SessionService {
  /**
   * Creates a new session for a user.
   * Returns the unhashed token (to be sent via HttpOnly cookie) and the database session record.
   */
  async createSession(userId: string): Promise<{ token: string; session: Session }> {
    // Generate 32 bytes (256 bits) of cryptographic entropy
    const rawToken = randomBytes(32).toString('hex');
    const sessionId = hashSessionToken(rawToken);

    const expiresAt = new Date(Date.now() + authConfig.sessionDurationMs);

    const session = await sessionRepository.createSession({
      id: sessionId,
      userId,
      expiresAt,
    });

    return { token: rawToken, session };
  }

  /**
   * Validates a raw session token.
   * Verifies expiry and checks that the user account is ACTIVE.
   */
  async validateSession(rawToken: string): Promise<{ session: Session; user: SafeUser } | null> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return null;
    }

    const sessionId = hashSessionToken(rawToken.trim());
    const result = await sessionRepository.findSessionWithUser(sessionId);

    if (!result) {
      return null;
    }

    const { session, user } = result;

    // Check expiration
    if (new Date() >= new Date(session.expiresAt)) {
      await sessionRepository.deleteSession(sessionId).catch(() => {});
      return null;
    }

    // Only ACTIVE users are permitted to authenticate
    if (user.status !== 'ACTIVE') {
      return null;
    }

    return {
      session,
      user: sanitizeUser(user),
    };
  }

  /**
   * Destroys an existing session by its raw token.
   * Safe to call even if the session does not exist.
   */
  async destroySession(rawToken?: string | null): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return;
    }

    const sessionId = hashSessionToken(rawToken.trim());
    await sessionRepository.deleteSession(sessionId).catch(() => {});
  }
}

export const sessionService = new SessionService();
