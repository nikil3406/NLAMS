import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local before DB imports
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnv();

import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { sessions } from '../../db/schema/sessions';
import { sessionService, hashSessionToken } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { sessionRepository } from '../../src/repositories/session.repository';
import { eq } from 'drizzle-orm';

describe('SessionService', () => {
  let testUserId: string;
  const testUserEmail = `session-test-${Date.now()}@nlams.gov.in`;

  before(async () => {
    // Create a temporary test user
    const passwordHash = await passwordService.hashPassword('TestPass@123');
    const [created] = await db
      .insert(users)
      .values({
        name: 'Session Test Officer',
        email: testUserEmail,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    testUserId = created.id;
  });

  after(async () => {
    // Clean up test user (cascades to sessions)
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await client.end();
  });

  it('creates an active session and stores hashed token in DB', async () => {
    const { token, session } = await sessionService.createSession(testUserId);

    assert.ok(token, 'Session token must be generated');
    assert.equal(typeof token, 'string');
    assert.equal(token.length, 64, 'Token must be 64 hex characters (32 bytes entropy)');

    // DB session id should equal sha256 of raw token
    const expectedSessionId = hashSessionToken(token);
    assert.equal(session.id, expectedSessionId, 'Database ID must store the SHA-256 hash of the token');
    assert.equal(session.userId, testUserId);
    assert.ok(session.expiresAt > new Date(), 'Session expiresAt must be in the future');

    // Clean up
    await sessionService.destroySession(token);
  });

  it('validates an active session and returns sanitized user', async () => {
    const { token } = await sessionService.createSession(testUserId);

    const result = await sessionService.validateSession(token);
    assert.ok(result, 'Active session must validate successfully');
    assert.equal(result.user.id, testUserId);
    assert.equal(result.user.email, testUserEmail);
    // Security check: passwordHash must NOT be returned on user object
    assert.equal((result.user as Record<string, unknown>).passwordHash, undefined);

    await sessionService.destroySession(token);
  });

  it('rejects an invalid session token', async () => {
    const result = await sessionService.validateSession('completely-invalid-nonexistent-token');
    assert.equal(result, null, 'Invalid token must return null');
  });

  it('rejects empty, null, or whitespace-only tokens', async () => {
    assert.equal(await sessionService.validateSession(''), null);
    assert.equal(await sessionService.validateSession('   '), null);
  });

  it('rejects an expired session and purges it', async () => {
    const { token, session } = await sessionService.createSession(testUserId);

    // Artificially expire the session in the database
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.id));

    const result = await sessionService.validateSession(token);
    assert.equal(result, null, 'Expired session must return null');

    // Verify it was purged from the database
    const lookup = await sessionRepository.findSessionWithUser(session.id);
    assert.equal(lookup, null, 'Expired session must be deleted on validation');
  });

  it('invalidates and destroys session on logout', async () => {
    const { token } = await sessionService.createSession(testUserId);

    // Confirm it is active
    const active = await sessionService.validateSession(token);
    assert.ok(active, 'Session should be valid before destruction');

    // Destroy session
    await sessionService.destroySession(token);

    // Validate again — must now be null
    const afterDestroy = await sessionService.validateSession(token);
    assert.equal(afterDestroy, null, 'Destroyed session must be rejected upon subsequent validation');
  });
});
