import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { userRoles } from '../../db/schema/user-roles';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { roles } from '../../db/schema/roles';
import { sessionService } from '../../src/services/auth/session.service';
import { authConfig } from '../../src/config/auth';
import { eq, inArray } from 'drizzle-orm';
import { GET as adminUnitsGetHandler, POST as adminUnitsPostHandler } from '../../src/app/api/administrative-units/route';
import { GET as unitGetHandler, PATCH as unitPatchHandler } from '../../src/app/api/administrative-units/[id]/route';
import { GET as childrenGetHandler } from '../../src/app/api/administrative-units/[id]/children/route';
import { GET as treeGetHandler } from '../../src/app/api/administrative-units/[id]/tree/route';

describe('Administrative Units API Route Handlers Flow', () => {
  const ts = Date.now();
  let superAdminId: string;
  let superAdminCookie: string;
  let unitIdIND: string;
  let unitIdKA: string;

  const testCodes: string[] = [];

  before(async () => {
    // Super admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super admin not found');
    superAdminId = sa.id;

    const { token } = await sessionService.createSession(superAdminId);
    superAdminCookie = `${authConfig.cookieName}=${token}`;

    const [ind] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'IND')).limit(1);
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    unitIdIND = ind.id;
    unitIdKA = ka.id;
  });

  after(async () => {
    if (testCodes.length > 0) {
      await db.delete(administrativeUnits).where(inArray(administrativeUnits.code, testCodes));
    }
    await client.end();
  });

  it('GET /api/administrative-units?tree=true returns 401 without session cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/administrative-units?tree=true');
    const res = await adminUnitsGetHandler(req);
    assert.equal(res.status, 401);
  });

  it('GET /api/administrative-units?tree=true returns hierarchical tree with valid session', async () => {
    const req = new NextRequest('http://localhost:3000/api/administrative-units?tree=true', {
      headers: { cookie: superAdminCookie },
    });
    const res = await adminUnitsGetHandler(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some((u: { code: string }) => u.code === 'IND'));
  });

  it('POST /api/administrative-units creates a unit with 201 Created', async () => {
    const testCode = `API-TEST-${ts}`;
    testCodes.push(testCode);

    const req = new NextRequest('http://localhost:3000/api/administrative-units', {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'API Created District',
        code: testCode,
        type: 'DISTRICT',
        parentId: unitIdKA,
        status: 'ACTIVE',
      }),
    });

    const res = await adminUnitsPostHandler(req);
    assert.equal(res.status, 201);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.code, testCode);
    assert.equal(body.data.parentId, unitIdKA);
  });

  it('POST /api/administrative-units rejects invalid input with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/administrative-units', {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '',
        code: 'invalid code spaces',
      }),
    });

    const res = await adminUnitsPostHandler(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
  });

  it('GET /api/administrative-units/[id] returns unit details with ancestors', async () => {
    const req = new NextRequest(`http://localhost:3000/api/administrative-units/${unitIdKA}`, {
      headers: { cookie: superAdminCookie },
    });
    const res = await unitGetHandler(req, {
      params: Promise.resolve({ id: unitIdKA }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, unitIdKA);
    assert.equal(body.data.code, 'KA');
    assert.ok(Array.isArray(body.data.ancestors));
    assert.ok(body.data.ancestors.some((a: { code: string }) => a.code === 'IND'));
  });

  it('GET /api/administrative-units/[id]/children returns child units', async () => {
    const req = new NextRequest(`http://localhost:3000/api/administrative-units/${unitIdKA}/children`, {
      headers: { cookie: superAdminCookie },
    });
    const res = await childrenGetHandler(req, {
      params: Promise.resolve({ id: unitIdKA }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some((c: { code: string }) => c.code === 'KA-BLR'));
  });

  it('GET /api/administrative-units/[id]/tree returns subtree', async () => {
    const req = new NextRequest(`http://localhost:3000/api/administrative-units/${unitIdKA}/tree`, {
      headers: { cookie: superAdminCookie },
    });
    const res = await treeGetHandler(req, {
      params: Promise.resolve({ id: unitIdKA }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.code, 'KA');
    assert.ok(Array.isArray(body.data.children));
  });

  it('PATCH /api/administrative-units/[id] updates unit with 200 OK', async () => {
    const testCode = `API-PATCH-${ts}`;
    testCodes.push(testCode);

    const [u] = await db
      .insert(administrativeUnits)
      .values({
        name: 'Before Patch',
        code: testCode,
        type: 'DISTRICT',
        parentId: unitIdKA,
      })
      .returning();

    const req = new NextRequest(`http://localhost:3000/api/administrative-units/${u.id}`, {
      method: 'PATCH',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'After Patch Updated',
      }),
    });

    const res = await unitPatchHandler(req, {
      params: Promise.resolve({ id: u.id }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'After Patch Updated');
  });

  it('PATCH /api/administrative-units/[id] rejects circular hierarchy with 409 Conflict', async () => {
    // Karnataka has Bengaluru Urban as child. Attempting to set Karnataka.parentId = Bengaluru Urban
    const [blr] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA-BLR')).limit(1);

    const req = new NextRequest(`http://localhost:3000/api/administrative-units/${unitIdKA}`, {
      method: 'PATCH',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parentId: blr.id,
      }),
    });

    const res = await unitPatchHandler(req, {
      params: Promise.resolve({ id: unitIdKA }),
    });
    assert.equal(res.status, 409);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /circular hierarchy/i);
  });
});
