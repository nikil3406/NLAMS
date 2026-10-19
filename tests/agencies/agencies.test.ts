import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NextRequest } from 'next/server';

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
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
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { eq } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { authConfig } from '../../src/config/auth';
import { seedImplementingAgencies } from '../../db/seeds/implementing-agencies';

// Route handlers
import { GET as agenciesGetHandler } from '../../src/app/api/implementing-agencies/route';
import { GET as agencyDetailGetHandler } from '../../src/app/api/implementing-agencies/[id]/route';

describe('Part A & D — Government Implementing Agency Catalogue', () => {
  let superAdminCookie: string;
  let nhaiAgencyId: string;

  before(async () => {
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);

    if (!sa) throw new Error('Super admin not found for test setup');
    const { token } = await sessionService.createSession(sa.id);
    superAdminCookie = `${authConfig.cookieName}=${token}`;

    const [nhai] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'NHAI'))
      .limit(1);

    if (nhai) {
      nhaiAgencyId = nhai.id;
    }
  });

  after(async () => {
    await client.end();
  });

  it('1. Seed script runs idempotently and creates no duplicate records', async () => {
    const stats = await seedImplementingAgencies(db);
    assert.equal(stats.inserted, 0, 'Second run must insert 0 duplicates');
    assert.ok(stats.unchanged >= 9, 'All 9 seed agencies must remain unchanged');
  });

  it('2. Authoritative source URLs and timestamps are retained', async () => {
    const [nhai] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'NHAI'))
      .limit(1);

    assert.ok(nhai, 'NHAI agency record must exist');
    assert.equal(nhai.name, 'National Highways Authority of India');
    assert.equal(nhai.sourceUrl, 'https://nhai.gov.in/');
    assert.ok(nhai.sourceVerifiedAt instanceof Date);
    assert.ok(nhai.officialWebsite?.includes('nhai.gov.in'));
  });

  it('3. Agency parent relationships are validly configured', async () => {
    const [nhai] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'NHAI'))
      .limit(1);

    const [morth] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'MORTH'))
      .limit(1);

    assert.ok(nhai && morth);
    assert.equal(nhai.parentAgencyId, morth.id, 'NHAI parent must reference MORTH');

    const [rvnl] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'RVNL'))
      .limit(1);

    const [mor] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'MOR'))
      .limit(1);

    assert.ok(rvnl && mor);
    assert.equal(rvnl.parentAgencyId, mor.id, 'RVNL parent must reference Ministry of Railways');
  });

  it('4. Agency API: GET /api/implementing-agencies requires authentication (401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/implementing-agencies');
    const res = await agenciesGetHandler(req);
    assert.equal(res.status, 401);
  });

  it('5. Agency API: GET /api/implementing-agencies returns paginated list for authenticated user', async () => {
    const req = new NextRequest('http://localhost:3000/api/implementing-agencies?limit=5', {
      headers: { cookie: superAdminCookie },
    });
    const res = await agenciesGetHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.equal(json.data.length, 5);
    assert.ok(json.pagination.total >= 9);
  });

  it('6. Agency API: search by code or name works as expected', async () => {
    const req = new NextRequest('http://localhost:3000/api/implementing-agencies?search=NHAI', {
      headers: { cookie: superAdminCookie },
    });
    const res = await agenciesGetHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].code, 'NHAI');
  });

  it('7. Agency API: GET /api/implementing-agencies/[id] returns detail with administrative unit and parent', async () => {
    assert.ok(nhaiAgencyId, 'NHAI ID must be resolved');
    const req = new NextRequest(`http://localhost:3000/api/implementing-agencies/${nhaiAgencyId}`, {
      headers: { cookie: superAdminCookie },
    });
    const res = await agencyDetailGetHandler(req, {
      params: Promise.resolve({ id: nhaiAgencyId }),
    });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.code, 'NHAI');
    assert.equal(json.data.parentAgency?.code, 'MORTH');
    assert.equal(json.data.administrativeUnit?.code, 'IND');
  });

  it('8. Agency API: GET /api/implementing-agencies/[id] returns 404 for unknown agency', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest(`http://localhost:3000/api/implementing-agencies/${randomUuid}`, {
      headers: { cookie: superAdminCookie },
    });
    const res = await agencyDetailGetHandler(req, {
      params: Promise.resolve({ id: randomUuid }),
    });
    assert.equal(res.status, 404);
  });
});
