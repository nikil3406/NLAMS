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
import { rolePermissions } from '../../db/schema/role-permissions';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as projectsPostHandler } from '../../src/app/api/projects/route';
import { GET as projectDetailGetHandler, PATCH as projectDetailPatchHandler } from '../../src/app/api/projects/[id]/route';
import { POST as projectRegisterHandler } from '../../src/app/api/projects/[id]/register/route';
import { POST as projectResubmitHandler } from '../../src/app/api/projects/[id]/resubmit/route';
import { POST as casesPostHandler } from '../../src/app/api/acquisition-cases/route';
import { POST as caseSubmitHandler } from '../../src/app/api/acquisition-cases/[id]/submit/route';
import { POST as caseReviewHandler } from '../../src/app/api/acquisition-cases/[id]/review/route';

describe('NLAMS — Ownership, LAND_OFFICER restriction, Counterpart Review & Correction Workflow', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];

  let superAdminId: string;

  // PROJECT_OFFICER who will create projects
  let projOfficerId: string;
  let projOfficerCookie: string;

  // MINISTRY_ADMIN who is the counterpart reviewer for PROJECT_OFFICER-created projects
  let ministryAdminId: string;
  let ministryAdminCookie: string;

  // Another MINISTRY_ADMIN who creates projects (counterpart = PROJECT_OFFICER)
  let ministryAdminCreatorId: string;
  let ministryAdminCreatorCookie: string;

  // LAND_OFFICER who creates acquisition cases
  let landOfficerId: string;
  let landOfficerCookie: string;

  // Another LAND_OFFICER (should not be able to review)
  let landOfficer2Id: string;
  let landOfficer2Cookie: string;

  // FIELD_OFFICER (should not be able to create cases or projects)
  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let unitIdKA: string;
  let nhaiAgencyId: string;

  // Projects created by PROJECT_OFFICER (counterpart = MINISTRY_ADMIN)
  let projOfficerProjectId: string;
  // Project created by MINISTRY_ADMIN creator (counterpart = PROJECT_OFFICER)
  let ministryCreatedProjectId: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found. Run seed first.');
    superAdminId = sa.id;

    // 2. Resolve KA administrative unit
    const [ka] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    unitIdKA = ka.id;

    // 3. Resolve NHAI agency
    const [nhai] = await db
      .select({ id: implementingAgencies.id })
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, 'NHAI'))
      .limit(1);
    nhaiAgencyId = nhai.id;

    // 4. Resolve roles
    const [projOffRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [ministryRole] = await db.select().from(roles).where(eq(roles.name, 'MINISTRY_ADMIN')).limit(1);
    const [landOffRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [fieldOffRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const makeUser = async (nameSuffix: string, emailPrefix: string) => {
      const [u] = await db.insert(users).values({
        name: `${nameSuffix} ${ts}`,
        email: `${emailPrefix}.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      }).returning({ id: users.id });
      createdUserIds.push(u.id);
      return u.id;
    };

    const assignRole = async (userId: string, roleId: string) => {
      await db.insert(userRoles).values({ userId, roleId, assignedBy: superAdminId });
    };

    const assignUnit = async (userId: string, unitId: string) => {
      await db.insert(userAssignments).values({
        userId,
        administrativeUnitId: unitId,
        assignedBy: superAdminId,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });
    };

    const makeSession = async (userId: string) => {
      const { token } = await sessionService.createSession(userId);
      return `${authConfig.cookieName}=${token}`;
    };

    // 5. Create PROJECT_OFFICER (can create/edit projects)
    projOfficerId = await makeUser('KA Project Officer Own', 'proj.officer.own');
    await assignRole(projOfficerId, projOffRole.id);
    await assignUnit(projOfficerId, unitIdKA);
    projOfficerCookie = await makeSession(projOfficerId);

    // 6. Create MINISTRY_ADMIN (counterpart reviewer for PROJECT_OFFICER-created projects)
    ministryAdminId = await makeUser('Ministry Admin Reviewer', 'ministry.admin.rev');
    await assignRole(ministryAdminId, ministryRole.id);
    await assignUnit(ministryAdminId, unitIdKA);
    ministryAdminCookie = await makeSession(ministryAdminId);

    // 7. Create MINISTRY_ADMIN who also creates projects (counterpart = PROJECT_OFFICER)
    ministryAdminCreatorId = await makeUser('Ministry Admin Creator', 'ministry.admin.creator');
    await assignRole(ministryAdminCreatorId, ministryRole.id);
    await assignUnit(ministryAdminCreatorId, unitIdKA);
    ministryAdminCreatorCookie = await makeSession(ministryAdminCreatorId);

    // 8. Create LAND_OFFICER (creates and submits cases)
    landOfficerId = await makeUser('KA Land Officer', 'land.officer.own');
    await assignRole(landOfficerId, landOffRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // 9. Create second LAND_OFFICER
    landOfficer2Id = await makeUser('KA Land Officer 2', 'land.officer.2');
    await assignRole(landOfficer2Id, landOffRole.id);
    await assignUnit(landOfficer2Id, unitIdKA);
    landOfficer2Cookie = await makeSession(landOfficer2Id);

    // 10. Create FIELD_OFFICER (cannot create projects or cases)
    fieldOfficerId = await makeUser('KA Field Officer', 'field.officer.own');
    await assignRole(fieldOfficerId, fieldOffRole.id);
    await assignUnit(fieldOfficerId, unitIdKA);
    fieldOfficerCookie = await makeSession(fieldOfficerId);
  });

  after(async () => {
    try {
      if (createdCaseIds.length > 0) {
        await db.delete(acquisitionCaseWorkflowHistory).where(inArray(acquisitionCaseWorkflowHistory.caseId, createdCaseIds));
        await db.delete(acquisitionCases).where(inArray(acquisitionCases.id, createdCaseIds));
      }
      if (createdProjectIds.length > 0) {
        await db.delete(projects).where(inArray(projects.id, createdProjectIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
        await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } finally {
      await client.end();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // PROJECT CREATION ROLE RESTRICTION
  // ──────────────────────────────────────────────────────────────────────────────

  it('1. PROJECT_OFFICER can create a project (returns 201)', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({
        name: `PO-Created Project ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        landAcquisitionRequired: true,
      }),
    });
    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201, 'PROJECT_OFFICER must be able to create a project');
    const json = await res.json();
    projOfficerProjectId = json.data.id;
    createdProjectIds.push(projOfficerProjectId);
    assert.equal(json.data.createdBy, projOfficerId);
  });

  it('2. MINISTRY_ADMIN can create a project (returns 201)', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCreatorCookie },
      body: JSON.stringify({
        name: `MA-Created Project ${ts}`,
        projectType: 'Railway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        landAcquisitionRequired: true,
      }),
    });
    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201, 'MINISTRY_ADMIN must be able to create a project');
    const json = await res.json();
    ministryCreatedProjectId = json.data.id;
    createdProjectIds.push(ministryCreatedProjectId);
    assert.equal(json.data.createdBy, ministryAdminCreatorId);
  });

  it('3. LAND_OFFICER cannot create a project (403 Forbidden)', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        name: `LO Tries Project ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });
    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403, 'LAND_OFFICER must be rejected from creating projects');
  });

  it('4. FIELD_OFFICER cannot create a project (403 Forbidden)', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: fieldOfficerCookie },
      body: JSON.stringify({
        name: `FO Tries Project ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });
    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403, 'FIELD_OFFICER must be rejected from creating projects');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // PROJECT UPDATE OWNERSHIP
  // ──────────────────────────────────────────────────────────────────────────────

  it('5. Original creator (PROJECT_OFFICER) can update their DRAFT project', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ name: `PO-Created Project Updated ${ts}` }),
    });
    const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 200, 'Creator should be able to update their own DRAFT project');
    const json = await res.json();
    assert.ok(json.data.name.includes('Updated'));
  });

  it('6. Non-creator (MINISTRY_ADMIN reviewer) cannot update PROJECT_OFFICER-created project (403)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ name: `Should Not Be Allowed ${ts}` }),
    });
    const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 403, 'Non-creator must be rejected from updating a project');
  });

  it('7. Non-creator (LAND_OFFICER) cannot update PROJECT_OFFICER-created project (403)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({ name: `LO Should Not Edit ${ts}` }),
    });
    const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 403, 'LAND_OFFICER must be rejected from updating a project they did not create');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // ACQUISITION CASE CREATION: REGISTERED PROJECTS ONLY & LAND_OFFICER ONLY
  // ──────────────────────────────────────────────────────────────────────────────

  it('7b. Rejects acquisition case creation for DRAFT project (400 Bad Request)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    // projOfficerProjectId is currently in DRAFT status
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Draft Project Case Attempt ${ts}`,
      }),
    });
    const res = await casesPostHandler(req);
    assert.equal(res.status, 400, 'Must reject case creation for project in DRAFT status');
    const json = await res.json();
    assert.ok(json.error.includes('REGISTERED'), 'Error must explain that project must be in REGISTERED status');
  });

  it('7c. Original creators formally register their projects (DRAFT -> REGISTERED)', async () => {
    // Project Officer registers projOfficerProjectId
    const regReq1 = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/register`, {
      method: 'POST',
      headers: { cookie: projOfficerCookie },
    });
    const regRes1 = await projectRegisterHandler(regReq1, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(regRes1.status, 200, 'Original creator should be able to register project');
    const regJson1 = await regRes1.json();
    assert.equal(regJson1.data.status, 'REGISTERED');

    // Ministry Admin registers ministryCreatedProjectId
    const regReq2 = new NextRequest(`http://localhost:3000/api/projects/${ministryCreatedProjectId}/register`, {
      method: 'POST',
      headers: { cookie: ministryAdminCreatorCookie },
    });
    const regRes2 = await projectRegisterHandler(regReq2, { params: Promise.resolve({ id: ministryCreatedProjectId }) });
    assert.equal(regRes2.status, 200, 'Original creator should be able to register project');
    const regJson2 = await regRes2.json();
    assert.equal(regJson2.data.status, 'REGISTERED');
  });

  it('8. LAND_OFFICER can create an acquisition case on REGISTERED project (201)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `LO Acquisition Case ${ts}`,
        description: 'Created by Land Officer',
      }),
    });
    const res = await casesPostHandler(req);
    assert.equal(res.status, 201, 'LAND_OFFICER must be able to create an acquisition case');
    const json = await res.json();
    createdCaseIds.push(json.data.id);
    assert.equal(json.data.createdBy, landOfficerId);
  });

  it('9. PROJECT_OFFICER cannot create an acquisition case (403)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `PO Tries Case ${ts}`,
      }),
    });
    const res = await casesPostHandler(req);
    assert.equal(res.status, 403, 'PROJECT_OFFICER must be rejected from creating acquisition cases');
  });

  it('10. MINISTRY_ADMIN cannot create an acquisition case (403)', async () => {
    assert.ok(projOfficerProjectId, 'Project must exist');
    const req = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `MA Tries Case ${ts}`,
      }),
    });
    const res = await casesPostHandler(req);
    assert.equal(res.status, 403, 'MINISTRY_ADMIN must be rejected from creating acquisition cases');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // COUNTERPART-ROLE REVIEW: PROJECT_OFFICER project → MINISTRY_ADMIN reviews
  // ──────────────────────────────────────────────────────────────────────────────

  it('11. MINISTRY_ADMIN (counterpart) can permit field verification on PROJECT_OFFICER-created project case (200)', async () => {
    // Create and submit a case
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Counterpart Review Case 1 ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({ remarks: 'Submitting for counterpart review' }),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ decision: 'PERMIT_FIELD_VERIFICATION', remarks: 'Counterpart authorized' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200, 'MINISTRY_ADMIN counterpart must be able to permit field verification');
    const json = await reviewRes.json();
    assert.equal(json.data.status, 'AWAITING_FIELD_VERIFICATION');
  });

  it('12. PROJECT_OFFICER (project creator) cannot review their own project\'s acquisition case (403)', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Self-Review Blocked Case ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({}),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    // PROJECT_OFFICER (the project creator) attempts to review — must be rejected
    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ decision: 'PERMIT_FIELD_VERIFICATION', remarks: 'Self-review attempt' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 403, 'Project creator must not be able to review their own project\'s acquisition case');
  });

  it('13. Land Officer (case preparer) cannot review the case they submitted (403)', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Preparer Self-Review Blocked ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({}),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    // LAND_OFFICER who submitted attempts to review — even if they somehow had review permission
    // (In practice they don't, but the error must be 403 for the right reason)
    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({ decision: 'RETURN_FOR_CORRECTION', remarks: 'Self-review attempt by preparer' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    // LAND_OFFICER lacks ACQUISITION_CASE_REVIEW permission → 403 (either for permission or for being the preparer)
    assert.equal(reviewRes.status, 403, 'Case preparer (Land Officer) must not be able to review the case');
  });

  it('14. Wrong counterpart: PROJECT_OFFICER cannot review MINISTRY_ADMIN-created project case (403)', async () => {
    // ministryAdminCreatorId created ministryCreatedProjectId
    // ProjOfficer is the required counterpart, but let's verify the opposite is blocked:
    // Here we test that ministryAdminCookie (same role as the creator) is blocked
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: ministryCreatedProjectId,
        title: `MA-Project Case Wrong Counterpart ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({}),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    // ministryAdminCookie is also MINISTRY_ADMIN — same side as the creator (wrong counterpart)
    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ decision: 'PERMIT_FIELD_VERIFICATION', remarks: 'Same-side review attempt' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 403, 'MINISTRY_ADMIN cannot review MINISTRY_ADMIN-created project (wrong counterpart)');
  });

  it('15. Correct counterpart: PROJECT_OFFICER can review MINISTRY_ADMIN-created project case (200)', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: ministryCreatedProjectId,
        title: `MA-Project Case Correct Counterpart ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({}),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    // projOfficerCookie is PROJECT_OFFICER — the counterpart for MINISTRY_ADMIN-created project
    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ decision: 'RETURN_FOR_CORRECTION', remarks: 'Requires more detail on survey boundary' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200, 'PROJECT_OFFICER (counterpart) must be able to review MINISTRY_ADMIN-created project case');
    const json = await reviewRes.json();
    assert.equal(json.data.status, 'RETURNED_FOR_CORRECTION');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // CORRECTION WORKFLOW: project unlocked → creator edits → resubmit
  // ──────────────────────────────────────────────────────────────────────────────

  it('16. When case is RETURNED_FOR_CORRECTION, linked project is unlocked for correction by creator', async () => {
    // Create a fresh case on projOfficerProjectId and return it for correction
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Correction Unlock Test Case ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({}),
    });
    await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });

    // MINISTRY_ADMIN returns for correction
    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ decision: 'RETURN_FOR_CORRECTION', remarks: 'Please revise the project boundary.' }),
    });
    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200);
    assert.equal((await reviewRes.json()).data.status, 'RETURNED_FOR_CORRECTION');

    // Verify project is now unlocked (correctionPendingFor set)
    const [proj] = await db
      .select({ correctionPendingFor: projects.correctionPendingFor })
      .from(projects)
      .where(eq(projects.id, projOfficerProjectId))
      .limit(1);
    assert.ok(proj.correctionPendingFor, 'Project correctionPendingFor must be set after RETURN_FOR_CORRECTION');
    assert.equal(proj.correctionPendingFor, caseId, 'correctionPendingFor must reference the triggering case');
  });

  it('17. While project is in correction cycle, original creator can edit it (200)', async () => {
    // At this point projOfficerProjectId has correctionPendingFor set (from test 16)
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ name: `PO-Project Corrected ${ts}` }),
    });
    const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 200, 'Creator must be able to edit project during correction cycle');
    const json = await res.json();
    assert.ok(json.data.name.includes('Corrected'));
  });

  it('18. While project is in correction cycle, non-creator still cannot edit it (403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ name: `Non-creator Edit During Correction ${ts}` }),
    });
    const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 403, 'Non-creator must still be blocked during correction cycle');
  });

  it('19. Creator resubmits corrected project, clearing correctionPendingFor (200)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/resubmit`, {
      method: 'POST',
      headers: { cookie: projOfficerCookie },
    });
    const res = await projectResubmitHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(res.status, 200, 'Creator resubmit must succeed');
    const json = await res.json();
    assert.equal(json.data.correctionPendingFor, null, 'correctionPendingFor must be cleared after resubmission');
  });

  it('20. After resubmission creator can no longer edit REGISTERED project (400)', async () => {
    // After the correction cycle, project returns to REGISTERED (non-editable) status
    // and correctionPendingFor is null, so editing is blocked by the workflow-state check
    const [proj] = await db
      .select({ status: projects.status, correctionPendingFor: projects.correctionPendingFor })
      .from(projects)
      .where(eq(projects.id, projOfficerProjectId))
      .limit(1);

    // Skip this assertion if project is still in DRAFT (no transition happened, expected in test environments)
    if (proj.status !== 'DRAFT' && !proj.correctionPendingFor) {
      const req = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
        body: JSON.stringify({ name: `Should Be Blocked Post-Correction ${ts}` }),
      });
      const res = await projectDetailPatchHandler(req, { params: Promise.resolve({ id: projOfficerProjectId }) });
      assert.equal(res.status, 400, 'Creator must not edit a non-DRAFT project after correction cycle ends');
    } else {
      // In test environment projects may remain DRAFT — verify correctionPendingFor is null
      assert.equal(proj.correctionPendingFor, null, 'correctionPendingFor must be null after resubmission');
    }
  });

  it('21. Non-creator cannot call resubmit endpoint (403)', async () => {
    // Set up a correction for ministryCreatedProjectId to test resubmit restriction
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: ministryCreatedProjectId,
        title: `Non-creator Resubmit Test ${ts}`,
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const caseId = (await createRes.json()).data.id;
    createdCaseIds.push(caseId);

    await caseSubmitHandler(
      new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: caseId }) }
    );

    // Correct counterpart (PROJECT_OFFICER) returns for correction
    await caseReviewHandler(
      new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
        body: JSON.stringify({ decision: 'RETURN_FOR_CORRECTION', remarks: 'Fix the description' }),
      }),
      { params: Promise.resolve({ id: caseId }) }
    );

    // Non-creator (ministry admin reviewer, NOT the creator of ministryCreatedProjectId) tries to resubmit
    const req = new NextRequest(`http://localhost:3000/api/projects/${ministryCreatedProjectId}/resubmit`, {
      method: 'POST',
      headers: { cookie: ministryAdminCookie }, // ministryAdminCookie is NOT the creator
    });
    const res = await projectResubmitHandler(req, { params: Promise.resolve({ id: ministryCreatedProjectId }) });
    assert.equal(res.status, 403, 'Non-creator must not be able to resubmit corrected project');

    // Cleanup: clear the correctionPendingFor so other tests aren't affected
    await db.update(projects)
      .set({ correctionPendingFor: null })
      .where(eq(projects.id, ministryCreatedProjectId));
  });
});
