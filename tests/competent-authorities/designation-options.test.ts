import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { sessionService } from '../../src/services/auth/session.service';
import { authConfig } from '../../src/config/auth';
import {
  COMPETENT_AUTHORITY_DESIGNATIONS,
  type CompetentAuthorityDesignation,
} from '../../src/validators/competent-authorities/create-authority.schema';
import { POST as createAuthorityHandler, GET as listAuthoritiesHandler } from '../../src/app/api/competent-authorities/route';
import { PATCH as updateAuthorityHandler, GET as getAuthorityHandler } from '../../src/app/api/competent-authorities/[id]/route';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nlams';

describe('Competent Authority Designation Options & Availability', () => {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  let superAdminCookie: string;
  let superAdminId: string;
  const createdAuthorityIds: string[] = [];
  const ts = Date.now();

  before(async () => {
    // 1. Find or create Super Admin user
    const [adminUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@nlams.gov.in'))
      .limit(1);

    if (!adminUser) {
      throw new Error('Seed admin user not found');
    }
    superAdminId = adminUser.id;

    // 2. Create session for super admin
    const saSession = await sessionService.createSession(superAdminId);
    superAdminCookie = `${authConfig.cookieName}=${saSession.token}`;
  });

  after(async () => {
    // Clean up created test authorities
    for (const id of createdAuthorityIds) {
      await db.delete(schema.authorityJurisdictions).where(eq(schema.authorityJurisdictions.authorityId, id));
      await db.delete(schema.authorityUserAssignments).where(eq(schema.authorityUserAssignments.authorityId, id));
      await db.delete(schema.competentAuthorities).where(eq(schema.competentAuthorities.id, id));
    }
    await client.end();
    setTimeout(() => process.exit(0), 100);
  });

  it('1. Verifies all 10 statutory designation options are defined in schema', () => {
    const expectedDesignations: CompetentAuthorityDesignation[] = [
      'District Collector',
      'Deputy Commissioner',
      'Special Land Acquisition Officer (SLAO)',
      'Land Acquisition Officer (LAO)',
      'Additional District Magistrate (ADM)',
      'Sub-Divisional Magistrate (SDM)',
      'Divisional Commissioner',
      'Designated State Government Authority',
      'Designated Central Government Authority',
      'Special Deputy Collector (Land Acquisition)',
    ];

    assert.strictEqual(COMPETENT_AUTHORITY_DESIGNATIONS.length, 10);
    for (const desig of expectedDesignations) {
      assert.ok(
        COMPETENT_AUTHORITY_DESIGNATIONS.includes(desig),
        `Expected ${desig} to be included in COMPETENT_AUTHORITY_DESIGNATIONS`
      );
    }
  });

  it('2. Accepts all 10 statutory designations via POST /api/competent-authorities', async () => {
    for (let i = 0; i < COMPETENT_AUTHORITY_DESIGNATIONS.length; i++) {
      const designation = COMPETENT_AUTHORITY_DESIGNATIONS[i];
      const code = `TEST-DESIG-${i}-${ts}`;

      const req = new NextRequest('http://localhost/api/competent-authorities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superAdminCookie,
        },
        body: JSON.stringify({
          authorityCode: code,
          authorityName: `Test Authority for ${designation} ${ts}`,
          designation,
          authorityLevel: i === 6 ? 'REGIONAL' : i === 7 ? 'STATE' : i === 8 ? 'CENTRAL' : 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        }),
      });

      const res = await createAuthorityHandler(req);
      assert.strictEqual(res.status, 201, `Failed to create authority with designation: ${designation}`);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.designation, designation);
      assert.strictEqual(json.data.authorityCode, code);

      createdAuthorityIds.push(json.data.id);
    }
  });

  it('3. Rejects invalid designation value on POST with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost/api/competent-authorities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: superAdminCookie,
      },
      body: JSON.stringify({
        authorityCode: `INVALID-DESIG-${ts}`,
        authorityName: `Invalid Authority ${ts}`,
        designation: 'Arbitrary Unauthorized Title',
        authorityLevel: 'DISTRICT',
        status: 'ACTIVE',
        effectiveFrom: '2026-01-01',
      }),
    });

    const res = await createAuthorityHandler(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.match(json.error, /designation/i);
  });

  it('4. Rejects invalid designation value on PATCH with 400 Bad Request', async () => {
    assert.ok(createdAuthorityIds.length > 0);
    const targetId = createdAuthorityIds[0];

    const req = new NextRequest(`http://localhost/api/competent-authorities/${targetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: superAdminCookie,
      },
      body: JSON.stringify({
        designation: 'Not A Real Designation',
      }),
    });

    const res = await updateAuthorityHandler(req, {
      params: Promise.resolve({ id: targetId }),
    });

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.match(json.error, /designation/i);
  });

  it('5. Updates an authority to another valid designation successfully', async () => {
    assert.ok(createdAuthorityIds.length > 0);
    const targetId = createdAuthorityIds[0];

    const req = new NextRequest(`http://localhost/api/competent-authorities/${targetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: superAdminCookie,
      },
      body: JSON.stringify({
        designation: 'Special Deputy Collector (Land Acquisition)',
      }),
    });

    const res = await updateAuthorityHandler(req, {
      params: Promise.resolve({ id: targetId }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.designation, 'Special Deputy Collector (Land Acquisition)');
  });

  it('6. GET /api/competent-authorities lists authorities with their designations', async () => {
    const req = new NextRequest('http://localhost/api/competent-authorities?status=ACTIVE', {
      method: 'GET',
      headers: { Cookie: superAdminCookie },
    });

    const res = await listAuthoritiesHandler(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length > 0);

    for (const auth of json.data) {
      assert.ok(auth.designation, 'Authority must have a designation');
      assert.ok(typeof auth.designation === 'string');
    }
  });

  it('7. GET /api/competent-authorities/[id] retrieves designation', async () => {
    assert.ok(createdAuthorityIds.length > 0);
    const targetId = createdAuthorityIds[0];

    const req = new NextRequest(`http://localhost/api/competent-authorities/${targetId}`, {
      method: 'GET',
      headers: { Cookie: superAdminCookie },
    });

    const res = await getAuthorityHandler(req, {
      params: Promise.resolve({ id: targetId }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.designation, 'Special Deputy Collector (Land Acquisition)');
  });
});
