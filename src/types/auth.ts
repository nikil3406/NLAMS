/**
 * Authentication Types
 * Phase 1 — Step 3: Authentication Foundation
 */

import type { User } from '../../db/schema/users';

/**
 * Safe user profile returned to clients and used in application context.
 * Excludes passwordHash and internal security secrets.
 */
export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthenticatedContext {
  user: SafeUser;
  session: AuthSession;
}
