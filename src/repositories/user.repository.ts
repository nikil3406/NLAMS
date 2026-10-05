import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { users, type User } from '../../db/schema/users';

/**
 * User repository providing authentication data access methods.
 * Keeps Drizzle queries isolated from services and route handlers.
 */
export class UserRepository {
  /**
   * Find an active or existing user by email (case-insensitive).
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    return user ?? null;
  }

  /**
   * Find a user by primary key ID.
   */
  async findUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }
}

export const userRepository = new UserRepository();
