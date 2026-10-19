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
import { userRoles } from '../../db/schema/user-roles';
import { userAssignments } from '../../db/schema/user-assignments';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { projects } from '../../db/schema/projects';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { GET as projectsGetHandler, POST as projectsPostHandler } from '../../src/app/api/projects/route';
import { GET as projectDetailGetHandler, PATCH as projectDetailPatchHandler } from '../../src/app/api/projects/[id]/route';
import { POST as projectRegisterHandler } from '../../src/app/api/projects/[id]/register/route';
import { PATCH as projectStatusHandler } from '../../src/app/api/projects/[id]/status/route';

describe('Part B, E, F, G, H, J — Project Management Foundation', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdAgencyIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let karnatakaOfficerId: string;
  let karnatakaOfficerCookie: string;

  let maharashtraOfficerId: string;
  let maharashtraOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let nhaiAgencyId: string;
  let inactiveAgencyId: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);

    if (!sa) throw new Error('Super admin not found for test setup');
    superAdminId = sa.id;
    const { token: saToken } = await sessionService.createSession(superAdminId);
    superAdminCookie = `${authConfig.cookieName}=${saToken}`;

    // 2. Resolve admin units
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitIdKA = ka.id;
    unitIdMH = mh.id;

    // 3. Resolve roles
    const [projOffRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [fieldOffRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    // 4. Resolve active agency (NHAI)
    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    nhaiAgencyId = nhai.id;

    // 5. Create an inactive agency for testing
    const [inactiveAgency] = await db
      .insert(implementingAgencies)
      .values({
        code: `INACT-${ts}`,
        name: `Inactive Agency ${ts}`,
        normalizedName: `inactiveagency${ts}`,
        agencyType: 'OTHER',
        status: 'INACTIVE',
        sourceUrl: 'https://example.gov.in',
        sourceVerifiedAt: new Date(),
      })
      .returning({ id: implementingAgencies.id });
    inactiveAgencyId = inactiveAgency.id;
    createdAgencyIds.push(inactiveAgencyId);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    // 6. Create Karnataka Project Officer (has PROJECT_CREATE, PROJECT_VIEW, PROJECT_UPDATE, PROJECT_REGISTER)
    const [kaUser] = await db
      .insert(users)
      .values({
        name: `KA Project Officer ${ts}`,
        email: `ka.officer.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    karnatakaOfficerId = kaUser.id;
    createdUserIds.push(karnatakaOfficerId);

    await db.insert(userRoles).values({
      userId: karnatakaOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: karnatakaOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: kaToken } = await sessionService.createSession(karnatakaOfficerId);
    karnatakaOfficerCookie = `${authConfig.cookieName}=${kaToken}`;

    // 7. Create Maharashtra Project Officer
    const [mhUser] = await db
      .insert(users)
      .values({
        name: `MH Project Officer ${ts}`,
        email: `mh.officer.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    maharashtraOfficerId = mhUser.id;
    createdUserIds.push(maharashtraOfficerId);

    await db.insert(userRoles).values({
      userId: maharashtraOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: maharashtraOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: mhToken } = await sessionService.createSession(maharashtraOfficerId);
    maharashtraOfficerCookie = `${authConfig.cookieName}=${mhToken}`;

    // 8. Create Field Officer (has PROJECT_VIEW, but NO PROJECT_CREATE or PROJECT_REGISTER)
    const [foUser] = await db
      .insert(users)
      .values({
        name: `Field Officer ${ts}`,
        email: `field.officer.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    fieldOfficerId = foUser.id;
    createdUserIds.push(fieldOfficerId);

    await db.insert(userRoles).values({
      userId: fieldOfficerId,
      roleId: fieldOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: fieldOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: foToken } = await sessionService.createSession(fieldOfficerId);
    fieldOfficerCookie = `${authConfig.cookieName}=${foToken}`;
  });

  after(async () => {
    if (createdProjectIds.length > 0) {
      await db.delete(projects).where(inArray(projects.id, createdProjectIds));
    }
    if (createdAgencyIds.length > 0) {
      await db.delete(implementingAgencies).where(inArray(implementingAgencies.id, createdAgencyIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await client.end();
  });

  it('1. Authorized user creates project starting in DRAFT with concurrency-safe project code', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bengaluru-Mysuru Corridor Phase 3',
        description: 'Highway expansion initiative',
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        landAcquisitionRequired: true,
        estimatedCost: '50000000.00',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2028-12-31',
      }),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id);
    assert.equal(json.data.status, 'DRAFT', 'New project must always start in DRAFT');
    assert.ok(json.data.projectCode.startsWith('NLAMS-PRJ-'), 'Project code must have correct prefix');
    assert.equal(json.data.implementingAgency.id, nhaiAgencyId);
    assert.equal(json.data.administrativeUnit.id, unitIdKA);
    assert.equal(json.data.creator.id, karnatakaOfficerId);

    createdProjectIds.push(json.data.id);
  });

  it('2. Unauthorized user without PROJECT_CREATE is rejected with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: fieldOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Unauthorized Project Attempt',
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403);
  });

  it('3. User cannot create project outside their administrative scope (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Karnataka User Creating in Maharashtra',
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdMH, // Outside scope!
      }),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403);
  });

  it('4. Association with unknown or inactive agency is rejected with 400', async () => {
    // Unknown agency
    const reqUnknown = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Project Unknown Agency',
        projectType: 'Highway',
        implementingAgencyId: '00000000-0000-0000-0000-000000000000',
        administrativeUnitId: unitIdKA,
      }),
    });
    const resUnknown = await projectsPostHandler(reqUnknown);
    assert.equal(resUnknown.status, 400);

    // Inactive agency
    const reqInactive = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Project Inactive Agency',
        projectType: 'Highway',
        implementingAgencyId: inactiveAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });
    const resInactive = await projectsPostHandler(reqInactive);
    assert.equal(resInactive.status, 400);
  });

  it('5. Invalid date ranges (end earlier than start) are rejected with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid Date Range Project',
        projectType: 'Railway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        plannedStartDate: '2028-01-01',
        plannedEndDate: '2026-01-01', // Earlier!
      }),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 400);
  });

  it('6. Client-supplied createdBy or status or projectCode is rejected with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tampered Payload Project',
        projectType: 'Railway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        status: 'REGISTERED', // Illegal client-supplied status
        projectCode: 'CUSTOM-CODE',
      }),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 400);
  });

  it('7. Scope-restricted project listing: user only sees projects within their administrative hierarchy', async () => {
    // 1. Create a Maharashtra project using Super Admin
    const reqMH = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Mumbai-Pune Expressway Link',
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdMH,
      }),
    });
    const resMH = await projectsPostHandler(reqMH);
    assert.equal(resMH.status, 201);
    const jsonMH = await resMH.json();
    createdProjectIds.push(jsonMH.data.id);

    // 2. Karnataka officer lists projects -> should see Karnataka projects but NOT Mumbai-Pune
    const reqListKA = new NextRequest('http://localhost:3000/api/projects', {
      headers: { cookie: karnatakaOfficerCookie },
    });
    const resListKA = await projectsGetHandler(reqListKA);
    assert.equal(resListKA.status, 200);
    const jsonListKA = await resListKA.json();

    const idsSeenByKA = jsonListKA.data.map((p: { id: string }) => p.id);
    assert.ok(idsSeenByKA.includes(createdProjectIds[0]), 'Karnataka officer must see Karnataka project');
    assert.ok(!idsSeenByKA.includes(jsonMH.data.id), 'Karnataka officer MUST NOT see Maharashtra project');
  });

  it('8. Cross-scope project access by guessing ID returns 404 (does not leak existence)', async () => {
    const mhProjectId = createdProjectIds[1]; // The Maharashtra project
    assert.ok(mhProjectId);

    const req = new NextRequest(`http://localhost:3000/api/projects/${mhProjectId}`, {
      headers: { cookie: karnatakaOfficerCookie }, // KA officer tries to read MH project
    });
    const res = await projectDetailGetHandler(req, {
      params: Promise.resolve({ id: mhProjectId }),
    });
    assert.equal(res.status, 404);
  });

  it('9. Project Registration: Formally registers DRAFT project to REGISTERED', async () => {
    const kaProjectId = createdProjectIds[0];
    assert.ok(kaProjectId);

    // Field officer (without PROJECT_REGISTER) tries to register -> 403
    const reqUnauthorized = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/register`, {
      method: 'POST',
      headers: { cookie: fieldOfficerCookie },
    });
    const resUnauthorized = await projectRegisterHandler(reqUnauthorized, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resUnauthorized.status, 403);

    // Karnataka Project Officer (has PROJECT_REGISTER) registers project
    const reqAuthorized = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/register`, {
      method: 'POST',
      headers: { cookie: karnatakaOfficerCookie },
    });
    const resAuthorized = await projectRegisterHandler(reqAuthorized, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resAuthorized.status, 200);

    const json = await resAuthorized.json();
    assert.equal(json.data.status, 'REGISTERED');
  });

  it('10. Status Transitions: Strictly enforces state machine and terminal states', async () => {
    const kaProjectId = createdProjectIds[0]; // Currently REGISTERED

    // 1. REGISTERED -> ON_HOLD
    const reqHold = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'ON_HOLD', reason: 'Reviewing alignment' }),
    });
    const resHold = await projectStatusHandler(reqHold, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resHold.status, 200);
    const jsonHold = await resHold.json();
    assert.equal(jsonHold.data.status, 'ON_HOLD');

    // 2. ON_HOLD -> REGISTERED
    const reqResume = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'REGISTERED' }),
    });
    const resResume = await projectStatusHandler(reqResume, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resResume.status, 200);

    // 3. REGISTERED -> COMPLETED (Terminal)
    const reqComplete = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const resComplete = await projectStatusHandler(reqComplete, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resComplete.status, 200);

    // 4. COMPLETED cannot transition to anything (Terminal) -> 400
    const reqIllegal = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}/status`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'REGISTERED' }),
    });
    const resIllegal = await projectStatusHandler(reqIllegal, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resIllegal.status, 400);

    // 5. Terminal project cannot be updated via general edit -> 400
    const reqEditTerminal = new NextRequest(`http://localhost:3000/api/projects/${kaProjectId}`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Editing Completed Project' }),
    });
    const resEditTerminal = await projectDetailPatchHandler(reqEditTerminal, {
      params: Promise.resolve({ id: kaProjectId }),
    });
    assert.equal(resEditTerminal.status, 400);
  });

  it('11. General Project Update rejects arbitrary status or immutable field changes', async () => {
    // Create another draft project
    const reqCreate = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Expressway Flyover Section',
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });
    const resCreate = await projectsPostHandler(reqCreate);
    const jsonCreate = await resCreate.json();
    const testProjectId = jsonCreate.data.id;
    createdProjectIds.push(testProjectId);

    // Try to update status through PATCH /api/projects/[id]
    const reqPatchStatus = new NextRequest(`http://localhost:3000/api/projects/${testProjectId}`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'REGISTERED' }),
    });
    const resPatchStatus = await projectDetailPatchHandler(reqPatchStatus, {
      params: Promise.resolve({ id: testProjectId }),
    });
    assert.equal(resPatchStatus.status, 400, 'PATCH /api/projects/[id] must reject status update');

    // Update permitted field (description and name)
    const reqValidUpdate = new NextRequest(`http://localhost:3000/api/projects/${testProjectId}`, {
      method: 'PATCH',
      headers: {
        cookie: karnatakaOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Expressway Flyover Section Updated',
        description: 'New detailed alignment description',
      }),
    });
    const resValidUpdate = await projectDetailPatchHandler(reqValidUpdate, {
      params: Promise.resolve({ id: testProjectId }),
    });
    assert.equal(resValidUpdate.status, 200);
    const jsonValid = await resValidUpdate.json();
    assert.equal(jsonValid.data.name, 'Expressway Flyover Section Updated');
  });
});
