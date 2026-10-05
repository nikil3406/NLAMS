import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { passwordService } from '../../src/services/auth/password.service';
import { POST as loginHandler } from '../../src/app/api/auth/login/route';
import { POST as logoutHandler } from '../../src/app/api/auth/logout/route';
import { GET as meHandler } from '../../src/app/api/auth/me/route';
import { authConfig } from '../../src/config/auth';
import { eq } from 'drizzle-orm';

describe('Auth API Endpoints Flow', () => {
  let testUserId: string;
  const testEmail = `api-flow-${Date.now()}@nlams.gov.in`;
  const testPassword = 'OfficerPassword#2026';
  let activeSessionCookie = '';

  before(async () => {
    const passwordHash = await passwordService.hashPassword(testPassword);
    const [created] = await db
      .insert(users)
      .values({
        name: 'API Test Officer',
        email: testEmail,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    testUserId = created.id;
  });

  after(async () => {
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await client.end();
  });

  it('POST /api/auth/login - validates input and rejects malformed email', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: testPassword }),
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.details.email);
  });

  it('POST /api/auth/login - rejects invalid password with generic error', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword#000' }),
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Invalid email or password');
  });

  it('POST /api/auth/login - rejects unknown email with identical generic error', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost-officer@nlams.gov.in', password: testPassword }),
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Invalid email or password');
  });

  it('POST /api/auth/login - authenticates valid credentials, returns safe user and HttpOnly cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.id, testUserId);
    assert.equal(body.user.email, testEmail);
    assert.equal(body.user.name, 'API Test Officer');
    assert.equal(body.user.status, 'ACTIVE');

    // Security: password or hash must never be in response body
    assert.equal(body.user.passwordHash, undefined);
    assert.equal(body.user.password, undefined);

    // Verify session cookie was set
    const cookie = res.cookies.get(authConfig.cookieName);
    assert.ok(cookie, 'Cookie must be present in response');
    assert.ok(cookie.value.length === 64, 'Cookie value must be the 64-char session token');
    assert.equal(cookie.httpOnly, true, 'Cookie must be HttpOnly');

    // Save token for subsequent tests
    activeSessionCookie = cookie.value;
  });

  it('GET /api/auth/me - returns authenticated user profile with valid cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${authConfig.cookieName}=${activeSessionCookie}`,
      },
    });

    const res = await meHandler(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.id, testUserId);
    assert.equal(body.user.email, testEmail);
    assert.equal(body.user.status, 'ACTIVE');
    assert.equal(body.user.passwordHash, undefined);
  });

  it('GET /api/auth/me - rejects unauthenticated request without cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
    });

    const res = await meHandler(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
  });

  it('GET /api/auth/me - rejects invalid or forged cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${authConfig.cookieName}=fake-session-token-value`,
      },
    });

    const res = await meHandler(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
  });

  it('POST /api/auth/logout - invalidates session and clears cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${authConfig.cookieName}=${activeSessionCookie}`,
      },
    });

    const res = await logoutHandler(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Logged out successfully');

    // Cookie must be cleared (maxAge: 0 or empty)
    const clearedCookie = res.cookies.get(authConfig.cookieName);
    assert.ok(clearedCookie);
    assert.equal(clearedCookie.value, '');
  });

  it('GET /api/auth/me - returns 401 after session was destroyed via logout', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${authConfig.cookieName}=${activeSessionCookie}`,
      },
    });

    const res = await meHandler(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
  });
});
