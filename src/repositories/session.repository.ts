import { eq, lt } from 'drizzle-orm';
import { db } from '../../db';
import { sessions, type Session, type NewSession } from '../../db/schema/sessions';
import { users, type User } from '../../db/schema/users';

export interface SessionWithUser {
  session: Session;
  user: User;
}

/**
 * Session repository providing database access methods for session lifecycle.
 */
export class SessionRepository {
  async createSession(data: NewSession): Promise<Session> {
    const [created] = await db
      .insert(sessions)
      .values(data)
      .returning();
    return created;
  }

  async findSessionWithUser(sessionId: string): Promise<SessionWithUser | null> {
    const rows = await db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0];
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db
      .delete(sessions)
      .where(eq(sessions.id, sessionId));
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await db
      .delete(sessions)
      .where(eq(sessions.userId, userId));
  }

  async deleteExpiredSessions(): Promise<void> {
    await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()));
  }
}

export const sessionRepository = new SessionRepository();
