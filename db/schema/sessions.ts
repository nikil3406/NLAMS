import { pgTable, varchar, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Sessions table for server-side session management.
 *
 * Security design:
 * - `id`: Stores the SHA-256 hash of the raw session token.
 *   Even if the database is compromised, raw tokens cannot be recovered.
 * - `user_id`: Cascades on user deletion.
 * - `expires_at`: Indexed for rapid expiration checks and cleanup.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ]
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
