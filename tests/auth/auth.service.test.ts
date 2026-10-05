import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { authService, AuthenticationError } from '../../src/services/auth/auth.service';
import { passwordService } from '../../src/services/auth/password.service';
import { eq } from 'drizzle-orm';

describe('AuthService', () => {
  let activeUserId: string;
  let suspendedUserId: string;

  const activeEmail = `auth-active-${Date.now()}@nlams.gov.in`;
  const suspendedEmail = `auth-suspended-${Date.now()}@nlams.gov.in`;
  const testPassword = 'Password@12345';

  before(async () => {
    const passwordHash = await passwordService.hashPassword(testPassword);

    // Create an active user
    const [active] = await db
      .insert(users)
      .values({
        name: 'Active Officer',
        email: activeEmail,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    activeUserId = active.id;

    // Create a suspended user
    const [suspended] = await db
      .insert(users)
      .values({
        name: 'Suspended Officer',
        email: suspendedEmail,
        passwordHash,
        status: 'SUSPENDED',
      })
      .returning({ id: users.id });
    suspendedUserId = suspended.id;
  });

  after(async () => {
    if (activeUserId) {
      await db.delete(users).where(eq(users.id, activeUserId));
    }
    if (suspendedUserId) {
      await db.delete(users).where(eq(users.id, suspendedUserId));
    }
    await client.end();
  });

  it('authenticates valid credentials successfully', async () => {
    const result = await authService.authenticateUser({
      email: activeEmail,
      password: testPassword,
    });

    assert.ok(result.sessionToken, 'Must generate a session token');
    assert.equal(result.user.id, activeUserId);
    assert.equal(result.user.email, activeEmail);
    assert.equal(result.user.status, 'ACTIVE');

    // Security: passwordHash must NOT be in returned user
    assert.equal((result.user as Record<string, unknown>).passwordHash, undefined);

    // Clean up session
    await authService.logoutUser(result.sessionToken);
  });

  it('rejects an incorrect password with generic error', async () => {
    await assert.rejects(
      async () => {
        await authService.authenticateUser({
          email: activeEmail,
          password: 'WrongPassword#999',
        });
      },
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.equal(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('rejects an unknown email with identical generic error', async () => {
    await assert.rejects(
      async () => {
        await authService.authenticateUser({
          email: 'nonexistent-user@nlams.gov.in',
          password: testPassword,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.equal(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('rejects a suspended user with identical generic error', async () => {
    await assert.rejects(
      async () => {
        await authService.authenticateUser({
          email: suspendedEmail,
          password: testPassword,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        assert.equal(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('retrieves authenticated user via valid session token', async () => {
    const { sessionToken } = await authService.authenticateUser({
      email: activeEmail,
      password: testPassword,
    });

    const user = await authService.getAuthenticatedUser(sessionToken);
    assert.ok(user, 'Should retrieve authenticated user');
    assert.equal(user.id, activeUserId);
    assert.equal(user.email, activeEmail);

    await authService.logoutUser(sessionToken);
  });

  it('returns null for null, empty, or invalid session tokens', async () => {
    assert.equal(await authService.getAuthenticatedUser(null), null);
    assert.equal(await authService.getAuthenticatedUser(''), null);
    assert.equal(await authService.getAuthenticatedUser('invalid-random-token'), null);
  });

  it('logout invalidates session and is safe to call multiple times', async () => {
    const { sessionToken } = await authService.authenticateUser({
      email: activeEmail,
      password: testPassword,
    });

    // Logout
    await authService.logoutUser(sessionToken);

    // Validation after logout must fail
    const userAfterLogout = await authService.getAuthenticatedUser(sessionToken);
    assert.equal(userAfterLogout, null, 'User should be unauthenticated after logout');

    // Calling logout again with same or null token should not throw
    await assert.doesNotReject(async () => {
      await authService.logoutUser(sessionToken);
      await authService.logoutUser(null);
    });
  });
});
