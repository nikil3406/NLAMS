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
import { acquisitionCases, acquisitionCaseWorkflowHistory } from '../../db/schema/acquisition-cases';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { GET as casesGetHandler, POST as casesPostHandler } from '../../src/app/api/acquisition-cases/route';
import { GET as caseDetailGetHandler, PATCH as caseDetailPatchHandler } from '../../src/app/api/acquisition-cases/[id]/route';
import { POST as caseSubmitHandler } from '../../src/app/api/acquisition-cases/[id]/submit/route';

describe('NLAMS Acquisition Cases — Step 1 Foundation & Submission Workflow', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let karnatakaLandOfficerId: string;
  let karnatakaLandOfficerCookie: string;

  let maharashtraLandOfficerId: string;
  let maharashtraLandOfficerCookie: string;

  let karnatakaProjectOfficerId: string; // Has ACQUISITION_CASE_VIEW only
  let karnatakaProjectOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let nhaiAgencyId: string;

  let kaProjectId: string;
  let mhProjectId: string;

  before(async () => {
    try {
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
      const [landOffRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
      const [projOffRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);

      // 4. Resolve active agency (NHAI)
      const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
      nhaiAgencyId = nhai.id;

      const pwdHash = await passwordService.hashPassword('Pass@123456789');

      // 5. Create Karnataka Land Officer (has ACQUISITION_CASE_CREATE, VIEW, UPDATE, SUBMIT)
      const [kaLandUser] = await db
        .insert(users)
        .values({
          name: `KA Land Officer ${ts}`,
          email: `ka.land.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status: 'ACTIVE',
        })
        .returning({ id: users.id });
      karnatakaLandOfficerId = kaLandUser.id;
      createdUserIds.push(karnatakaLandOfficerId);

      await db.insert(userRoles).values({
        userId: karnatakaLandOfficerId,
        roleId: landOffRole.id,
        assignedBy: superAdminId,
      });
      await db.insert(userAssignments).values({
        userId: karnatakaLandOfficerId,
        administrativeUnitId: unitIdKA,
        assignedBy: superAdminId,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });

      const { token: kaLandToken } = await sessionService.createSession(karnatakaLandOfficerId);
      karnatakaLandOfficerCookie = `${authConfig.cookieName}=${kaLandToken}`;

      // 6. Create Maharashtra Land Officer
      const [mhLandUser] = await db
        .insert(users)
        .values({
          name: `MH Land Officer ${ts}`,
          email: `mh.land.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status: 'ACTIVE',
        })
        .returning({ id: users.id });
      maharashtraLandOfficerId = mhLandUser.id;
      createdUserIds.push(maharashtraLandOfficerId);

      await db.insert(userRoles).values({
        userId: maharashtraLandOfficerId,
        roleId: landOffRole.id,
        assignedBy: superAdminId,
      });
      await db.insert(userAssignments).values({
        userId: maharashtraLandOfficerId,
        administrativeUnitId: unitIdMH,
        assignedBy: superAdminId,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });

      const { token: mhLandToken } = await sessionService.createSession(maharashtraLandOfficerId);
      maharashtraLandOfficerCookie = `${authConfig.cookieName}=${mhLandToken}`;

      // 7. Create Karnataka Project Officer (has ACQUISITION_CASE_VIEW only, NO CREATE or SUBMIT)
      const [kaProjUser] = await db
        .insert(users)
        .values({
          name: `KA Project Officer ${ts}`,
          email: `ka.proj.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status: 'ACTIVE',
        })
        .returning({ id: users.id });
      karnatakaProjectOfficerId = kaProjUser.id;
      createdUserIds.push(karnatakaProjectOfficerId);

      await db.insert(userRoles).values({
        userId: karnatakaProjectOfficerId,
        roleId: projOffRole.id,
        assignedBy: superAdminId,
      });
      await db.insert(userAssignments).values({
        userId: karnatakaProjectOfficerId,
        administrativeUnitId: unitIdKA,
        assignedBy: superAdminId,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });

      const { token: kaProjToken } = await sessionService.createSession(karnatakaProjectOfficerId);
      karnatakaProjectOfficerCookie = `${authConfig.cookieName}=${kaProjToken}`;

      // 8. Create a test Project in Karnataka
      const [kaProj] = await db
        .insert(projects)
        .values({
          projectCode: `KA-PRJ-${ts}`,
          name: `Karnataka Express Highway ${ts}`,
          projectType: 'Highway',
          implementingAgencyId: nhaiAgencyId,
          administrativeUnitId: unitIdKA,
          createdBy: superAdminId,
          status: 'REGISTERED',
        })
        .returning({ id: projects.id });
      kaProjectId = kaProj.id;
      createdProjectIds.push(kaProjectId);

      // 9. Create a test Project in Maharashtra
      const [mhProj] = await db
        .insert(projects)
        .values({
          projectCode: `MH-PRJ-${ts}`,
          name: `Maharashtra Coastal Road ${ts}`,
          projectType: 'Highway',
          implementingAgencyId: nhaiAgencyId,
          administrativeUnitId: unitIdMH,
          createdBy: superAdminId,
          status: 'REGISTERED',
        })
        .returning({ id: projects.id });
      mhProjectId = mhProj.id;
      createdProjectIds.push(mhProjectId);
    } catch (err) {
      console.error('CRITICAL ERROR IN BEFORE HOOK:', err);
      throw err;
    }
  });

  after(async () => {
    try {
      // Clean up created acquisition cases & history
      if (createdCaseIds.length > 0) {
        await db.delete(acquisitionCaseWorkflowHistory).where(inArray(acquisitionCaseWorkflowHistory.caseId, createdCaseIds));
        await db.delete(acquisitionCases).where(inArray(acquisitionCases.id, createdCaseIds));
      }
      // Clean up created projects
      if (createdProjectIds.length > 0) {
        await db.delete(projects).where(inArray(projects.id, createdProjectIds));
      }
      // Clean up created users & assignments
      if (createdUserIds.length > 0) {
        await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
        await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } finally {
      await client.end();
    }
  });

  it('1. Authorized user creates a draft acquisition case with concurrency-safe reference and initial audit history', async () => {
    const payload = {
      projectId: kaProjectId,
      title: `Bengaluru Sector 4 Acquisition ${ts}`,
      description: 'Initial land acquisition for 40 meters ROW along highway.',
    };

    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify(payload),
    });

    const res = await casesPostHandler(req);
    assert.equal(res.status, 201, 'Should return 201 Created');

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id, 'Case ID should be present');
    createdCaseIds.push(json.data.id);

    // Verify properties
    assert.equal(json.data.status, 'DRAFT', 'Initial status must be DRAFT');
    assert.equal(json.data.title, payload.title);
    assert.equal(json.data.description, payload.description);
    assert.ok(json.data.caseReference.startsWith('NLAMS-ACQ-'), 'Case reference should match format NLAMS-ACQ-XXXXXX');
    assert.equal(json.data.createdBy, karnatakaLandOfficerId, 'Creator must be authenticated user');

    // Verify atomic workflow history entry
    const history = await db
      .select()
      .from(acquisitionCaseWorkflowHistory)
      .where(eq(acquisitionCaseWorkflowHistory.caseId, json.data.id));

    assert.equal(history.length, 1, 'Initial workflow history entry must be recorded');
    assert.equal(history[0].action, 'CREATE');
    assert.equal(history[0].fromStatus, null);
    assert.equal(history[0].toStatus, 'DRAFT');
    assert.equal(history[0].actorId, karnatakaLandOfficerId);
    assert.equal(history[0].caseReference, json.data.caseReference);
  });

  it('2. Rejects case creation for non-existent project (400)', async () => {
    const fakeProjectId = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        projectId: fakeProjectId,
        title: 'Non-existent project case',
      }),
    });

    const res = await casesPostHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.error, /not found/i);
  });

  it('3. Rejects case creation for out-of-scope project (403 Forbidden)', async () => {
    // Karnataka Land Officer attempting to create case for Maharashtra project
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        projectId: mhProjectId, // Maharashtra project!
        title: 'Unauthorized Cross-State Case',
      }),
    });

    const res = await casesPostHandler(req);
    assert.equal(res.status, 403, 'Should reject cross-scope project association with 403 Forbidden');
    const json = await res.json();
    assert.equal(json.success, false);
  });

  it('4. Rejects client-supplied status, caseReference, or creator ID (400 Bad Request)', async () => {
    const tamperedPayload = {
      projectId: kaProjectId,
      title: 'Tampered Case Payload',
      status: 'SUBMITTED', // Client trying to bypass DRAFT
      caseReference: 'NLAMS-ACQ-999999',
      createdBy: superAdminId,
    };

    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify(tamperedPayload),
    });

    const res = await casesPostHandler(req);
    assert.equal(res.status, 400, 'Tampered payload should be rejected with 400');
    const json = await res.json();
    assert.equal(json.success, false);
  });

  it('5. User without ACQUISITION_CASE_CREATE is rejected with 403 Forbidden', async () => {
    // Project Officer lacks ACQUISITION_CASE_CREATE permission
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaProjectOfficerCookie,
      },
      body: JSON.stringify({
        projectId: kaProjectId,
        title: 'Project Officer Unauthorized Create',
      }),
    });

    const res = await casesPostHandler(req);
    assert.equal(res.status, 403, 'User without create permission must receive 403 Forbidden');
  });

  it('6. Lists and filters acquisition cases within authorized administrative scope', async () => {
    // Create a case in Maharashtra by MH officer
    const mhReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: maharashtraLandOfficerCookie,
      },
      body: JSON.stringify({
        projectId: mhProjectId,
        title: `Maharashtra Acquisition Case ${ts}`,
      }),
    });
    const mhRes = await casesPostHandler(mhReq);
    assert.equal(mhRes.status, 201);
    const mhJson = await mhRes.json();
    createdCaseIds.push(mhJson.data.id);

    // 1. Karnataka officer lists cases
    const kaListReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      headers: { cookie: karnatakaLandOfficerCookie },
    });
    const kaListRes = await casesGetHandler(kaListReq);
    assert.equal(kaListRes.status, 200);
    const kaListJson = await kaListRes.json();

    const kaIds = kaListJson.data.map((c: { id: string }) => c.id);
    assert.ok(!kaIds.includes(mhJson.data.id), 'Karnataka officer must NOT see Maharashtra case');

    // 2. Super Admin lists cases (sees both)
    const saListReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      headers: { cookie: superAdminCookie },
    });
    const saListRes = await casesGetHandler(saListReq);
    assert.equal(saListRes.status, 200);
    const saListJson = await saListRes.json();
    const saIds = saListJson.data.map((c: { id: string }) => c.id);
    assert.ok(saIds.includes(mhJson.data.id), 'Super Admin must see all cases nationwide');
  });

  it('7. Cross-scope case retrieval returns 404 (does not leak case existence)', async () => {
    // Karnataka officer trying to fetch Maharashtra case ID
    const mhCaseId = createdCaseIds[createdCaseIds.length - 1]; // last created was MH case
    const req = new NextRequest(`http://localhost:3000/api/acquisition-cases/${mhCaseId}`, {
      headers: { cookie: karnatakaLandOfficerCookie },
    });
    const res = await caseDetailGetHandler(req, {
      params: Promise.resolve({ id: mhCaseId }),
    });

    assert.equal(res.status, 404, 'Accessing out-of-scope case must return 404');
  });

  it('8. Updates permitted case fields in DRAFT status, but rejects status tampering in PATCH', async () => {
    const kaCaseId = createdCaseIds[0];

    // 1. Valid update of title and description
    const validPatchReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${kaCaseId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        title: `Updated Title for Sector 4 ${ts}`,
        description: 'Updated acquisition description and remarks.',
      }),
    });

    const patchRes = await caseDetailPatchHandler(validPatchReq, {
      params: Promise.resolve({ id: kaCaseId }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.data.title, `Updated Title for Sector 4 ${ts}`);
    assert.equal(patchJson.data.status, 'DRAFT', 'Status must remain DRAFT');

    // 2. Status tampering attempt via general PATCH is rejected
    const tamperPatchReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${kaCaseId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        status: 'SUBMITTED',
      }),
    });

    const tamperRes = await caseDetailPatchHandler(tamperPatchReq, {
      params: Promise.resolve({ id: kaCaseId }),
    });
    assert.equal(tamperRes.status, 400, 'Attempting to change status via PATCH must be rejected with 400');
  });

  it('9. Submits a draft case for review via dedicated submit endpoint and records history', async () => {
    const kaCaseId = createdCaseIds[0];
    const submitRemarks = 'Ready for official administrative review and field survey authorization.';

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${kaCaseId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({ remarks: submitRemarks }),
    });

    const submitRes = await caseSubmitHandler(submitReq, {
      params: Promise.resolve({ id: kaCaseId }),
    });
    assert.equal(submitRes.status, 200, 'Submit endpoint should return 200 OK');

    const submitJson = await submitRes.json();
    assert.equal(submitJson.success, true);
    assert.equal(submitJson.data.status, 'SUBMITTED');
    assert.equal(submitJson.data.submissionRemarks, submitRemarks);
    assert.ok(submitJson.data.submittedAt, 'submittedAt timestamp must be populated');

    // Verify workflow history has SUBMIT entry
    const history = await db
      .select()
      .from(acquisitionCaseWorkflowHistory)
      .where(eq(acquisitionCaseWorkflowHistory.caseId, kaCaseId));

    assert.equal(history.length, 2, 'Should have CREATE and SUBMIT history entries');
    const submitEntry = history.find((h) => h.action === 'SUBMIT');
    assert.ok(submitEntry, 'SUBMIT action entry must exist');
    assert.equal(submitEntry.fromStatus, 'DRAFT');
    assert.equal(submitEntry.toStatus, 'SUBMITTED');
    assert.equal(submitEntry.actorId, karnatakaLandOfficerId);
    assert.equal(submitEntry.remarks, submitRemarks);
  });

  it('10. Once submitted, editing case via PATCH is blocked (400 Bad Request)', async () => {
    const kaCaseId = createdCaseIds[0];

    const editSubmittedReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${kaCaseId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        title: 'Attempted Edit on Submitted Case',
      }),
    });

    const editRes = await caseDetailPatchHandler(editSubmittedReq, {
      params: Promise.resolve({ id: kaCaseId }),
    });
    assert.equal(editRes.status, 400, 'Editing submitted case must be blocked with 400 Bad Request');
    const json = await editRes.json();
    assert.match(json.error, /cannot edit case in 'SUBMITTED' status/i);
  });

  it('11. Submitting an already submitted case is rejected (400 Bad Request)', async () => {
    const kaCaseId = createdCaseIds[0];

    const doubleSubmitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${kaCaseId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({ remarks: 'Re-submitting already submitted case' }),
    });

    const doubleSubmitRes = await caseSubmitHandler(doubleSubmitReq, {
      params: Promise.resolve({ id: kaCaseId }),
    });
    assert.equal(doubleSubmitRes.status, 400);
    const json = await doubleSubmitRes.json();
    assert.match(json.error, /current status is 'SUBMITTED'/i);
  });

  it('12. User without ACQUISITION_CASE_SUBMIT permission cannot submit a case (403 Forbidden)', async () => {
    // Create a new draft case by Land Officer
    const draftReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaLandOfficerCookie,
      },
      body: JSON.stringify({
        projectId: kaProjectId,
        title: `Permission Check Case ${ts}`,
      }),
    });
    const draftRes = await casesPostHandler(draftReq);
    assert.equal(draftRes.status, 201);
    const draftJson = await draftRes.json();
    createdCaseIds.push(draftJson.data.id);

    // Project Officer lacks ACQUISITION_CASE_SUBMIT permission
    const unauthSubmitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${draftJson.data.id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaProjectOfficerCookie,
      },
      body: JSON.stringify({ remarks: 'Unauthorized submit attempt' }),
    });

    const unauthSubmitRes = await caseSubmitHandler(unauthSubmitReq, {
      params: Promise.resolve({ id: draftJson.data.id }),
    });
    assert.equal(unauthSubmitRes.status, 403, 'Unauthorized submit must be rejected with 403 Forbidden');
  });

  it('13. Generates unique, concurrency-safe case references', async () => {
    // Create two cases in rapid succession
    const req1 = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: karnatakaLandOfficerCookie },
      body: JSON.stringify({ projectId: kaProjectId, title: `Sequential Case A ${ts}` }),
    });
    const req2 = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: karnatakaLandOfficerCookie },
      body: JSON.stringify({ projectId: kaProjectId, title: `Sequential Case B ${ts}` }),
    });

    const [res1, res2] = await Promise.all([casesPostHandler(req1), casesPostHandler(req2)]);
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);

    const json1 = await res1.json();
    const json2 = await res2.json();
    createdCaseIds.push(json1.data.id, json2.data.id);

    assert.notEqual(json1.data.caseReference, json2.data.caseReference, 'Case references must be distinct');
    assert.ok(json1.data.caseReference.startsWith('NLAMS-ACQ-'));
    assert.ok(json2.data.caseReference.startsWith('NLAMS-ACQ-'));
  });
});
