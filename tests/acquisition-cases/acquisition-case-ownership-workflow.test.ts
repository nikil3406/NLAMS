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
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as projectsPostHandler } from '../../src/app/api/projects/route';
import { PATCH as projectDetailPatchHandler } from '../../src/app/api/projects/[id]/route';
import { POST as projectRegisterHandler } from '../../src/app/api/projects/[id]/register/route';
import { POST as projectResubmitHandler } from '../../src/app/api/projects/[id]/resubmit/route';
import { POST as projectReviewHandler } from '../../src/app/api/projects/[id]/review/route';
import { POST as casesPostHandler, GET as casesListHandler } from '../../src/app/api/acquisition-cases/route';
import { GET as caseDetailGetHandler } from '../../src/app/api/acquisition-cases/[id]/route';
import { POST as parcelsPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/route';

describe('NLAMS-02 — Relocate Project Approval and Remove Acquisition Case Approval', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];

  let superAdminId: string;

  // PROJECT_OFFICER who creates projects
  let projOfficerId: string;
  let projOfficerCookie: string;

  // MINISTRY_ADMIN counterpart reviewer for PROJECT_OFFICER-created projects
  let ministryAdminId: string;
  let ministryAdminCookie: string;

  // Another MINISTRY_ADMIN who creates projects (counterpart = PROJECT_OFFICER)
  let ministryAdminCreatorId: string;
  let ministryAdminCreatorCookie: string;

  // LAND_OFFICER who creates acquisition cases
  let landOfficerId: string;
  let landOfficerCookie: string;

  // FIELD_OFFICER who creates parcel records under active cases
  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let unitIdKA: string;
  let nhaiAgencyId: string;

  // Projects created
  let projOfficerProjectId: string;
  let ministryCreatedProjectId: string;
  let draftProjectId: string;

  // Newly created case ID
  let activeCaseId: string;

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

    // 5. Create PROJECT_OFFICER
    projOfficerId = await makeUser('KA Project Officer', 'proj.officer.nlams02');
    await assignRole(projOfficerId, projOffRole.id);
    await assignUnit(projOfficerId, unitIdKA);
    projOfficerCookie = await makeSession(projOfficerId);

    // 6. Create MINISTRY_ADMIN (counterpart reviewer for PROJECT_OFFICER projects)
    ministryAdminId = await makeUser('Ministry Admin Reviewer', 'ministry.admin.rev02');
    await assignRole(ministryAdminId, ministryRole.id);
    await assignUnit(ministryAdminId, unitIdKA);
    ministryAdminCookie = await makeSession(ministryAdminId);

    // 7. Create MINISTRY_ADMIN creator
    ministryAdminCreatorId = await makeUser('Ministry Admin Creator', 'ministry.admin.cr02');
    await assignRole(ministryAdminCreatorId, ministryRole.id);
    await assignUnit(ministryAdminCreatorId, unitIdKA);
    ministryAdminCreatorCookie = await makeSession(ministryAdminCreatorId);

    // 8. Create LAND_OFFICER (creates cases)
    landOfficerId = await makeUser('KA Land Officer', 'land.officer.nlams02');
    await assignRole(landOfficerId, landOffRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // 9. Create FIELD_OFFICER (creates parcels)
    fieldOfficerId = await makeUser('KA Field Officer', 'field.officer.nlams02');
    await assignRole(fieldOfficerId, fieldOffRole.id);
    await assignUnit(fieldOfficerId, unitIdKA);
    fieldOfficerCookie = await makeSession(fieldOfficerId);
  });

  after(async () => {
    try {
      if (createdCaseIds.length > 0) {
        await db.delete(acquisitionCaseParcels).where(inArray(acquisitionCaseParcels.caseId, createdCaseIds));
        await db.delete(acquisitionCaseWorkflowHistory).where(inArray(acquisitionCaseWorkflowHistory.caseId, createdCaseIds));
        await db.delete(acquisitionCases).where(inArray(acquisitionCases.id, createdCaseIds));
      }
      if (createdParcelIds.length > 0) {
        await db.delete(landParcels).where(inArray(landParcels.id, createdParcelIds));
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
  // SCENARIO 1 & 2: Project Creation & Registration entering Counterpart Review
  // ──────────────────────────────────────────────────────────────────────────────

  it('1. PROJECT_OFFICER creates a project -> registers it -> enters SUBMITTED status for MINISTRY_ADMIN review', async () => {
    // Step 1: Create project in DRAFT
    const createReq = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({
        name: `PO Highway Project ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        landAcquisitionRequired: true,
      }),
    });
    const createRes = await projectsPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const json = await createRes.json();
    projOfficerProjectId = json.data.id;
    createdProjectIds.push(projOfficerProjectId);
    assert.equal(json.data.status, 'DRAFT');

    // Step 2: Register project -> enters review queue in SUBMITTED status
    const regReq = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/register`, {
      method: 'POST',
      headers: { cookie: projOfficerCookie },
    });
    const regRes = await projectRegisterHandler(regReq, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(regRes.status, 200);
    const regJson = await regRes.json();
    assert.equal(regJson.data.status, 'SUBMITTED', 'Registered project must enter SUBMITTED status for review');
  });

  it('2. MINISTRY_ADMIN creates a project -> registers it -> enters SUBMITTED status for PROJECT_OFFICER review', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCreatorCookie },
      body: JSON.stringify({
        name: `MA Railway Project ${ts}`,
        projectType: 'Railway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
        landAcquisitionRequired: true,
      }),
    });
    const createRes = await projectsPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const json = await createRes.json();
    ministryCreatedProjectId = json.data.id;
    createdProjectIds.push(ministryCreatedProjectId);

    const regReq = new NextRequest(`http://localhost:3000/api/projects/${ministryCreatedProjectId}/register`, {
      method: 'POST',
      headers: { cookie: ministryAdminCreatorCookie },
    });
    const regRes = await projectRegisterHandler(regReq, { params: Promise.resolve({ id: ministryCreatedProjectId }) });
    assert.equal(regRes.status, 200);
    const regJson = await regRes.json();
    assert.equal(regJson.data.status, 'SUBMITTED');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 4 & 5: Acquisition Case Creation Gates: DRAFT and SUBMITTED Rejected
  // ──────────────────────────────────────────────────────────────────────────────

  it('4. Project is still a draft -> acquisition case creation is rejected (400 Bad Request)', async () => {
    // Create an un-registered DRAFT project
    const draftReq = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({
        name: `Draft Only Project ${ts}`,
        projectType: 'Water Supply',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitIdKA,
      }),
    });
    const draftRes = await projectsPostHandler(draftReq);
    assert.equal(draftRes.status, 201);
    draftProjectId = (await draftRes.json()).data.id;
    createdProjectIds.push(draftProjectId);

    // LAND_OFFICER attempts case creation on DRAFT project
    const caseReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: draftProjectId,
        title: `Attempt Case on Draft ${ts}`,
      }),
    });
    const caseRes = await casesPostHandler(caseReq);
    assert.equal(caseRes.status, 400, 'Must reject case creation on DRAFT project');
    const json = await caseRes.json();
    assert.ok(json.error.toLowerCase().includes('draft'));
  });

  it('5. Project is pending review (SUBMITTED) -> acquisition case creation is rejected (400 Bad Request)', async () => {
    // projOfficerProjectId is currently in SUBMITTED status (pending counterpart review)
    const caseReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Attempt Case on Submitted Project ${ts}`,
      }),
    });
    const caseRes = await casesPostHandler(caseReq);
    assert.equal(caseRes.status, 400, 'Must reject case creation on pending-review project');
    const json = await caseRes.json();
    assert.ok(json.error.toLowerCase().includes('pending review') || json.error.toLowerCase().includes('accepted'));
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Counterpart Review Rules & Correction Cycle
  // ──────────────────────────────────────────────────────────────────────────────

  it('6a. Separation of duties: Creator cannot review their own project (403 Forbidden)', async () => {
    const reviewReq = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });
    const reviewRes = await projectReviewHandler(reviewReq, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(reviewRes.status, 403, 'Creator cannot review own project');
  });

  it('6b. Counterpart role check: Same role cannot review (403 Forbidden)', async () => {
    // ministryAdminCookie attempts to review ministryCreatedProjectId (both are MINISTRY_ADMIN)
    const reviewReq = new NextRequest(`http://localhost:3000/api/projects/${ministryCreatedProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });
    const reviewRes = await projectReviewHandler(reviewReq, { params: Promise.resolve({ id: ministryCreatedProjectId }) });
    assert.equal(reviewRes.status, 403, 'MINISTRY_ADMIN cannot review MINISTRY_ADMIN project');
  });

  it('6c. Counterpart requests corrections -> project enters correction-pending state', async () => {
    const reviewReq = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({
        decision: 'REQUEST_CORRECTIONS',
        remarks: 'Please clarify the estimated cost and project scope.',
      }),
    });
    const reviewRes = await projectReviewHandler(reviewReq, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(reviewRes.status, 200);
    const json = await reviewRes.json();
    assert.ok(json.data.correctionPendingFor, 'Project correctionPendingFor must be set');
  });

  it('6d. Project has correction requested -> acquisition case creation is rejected (400 Bad Request)', async () => {
    const caseReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Attempt Case on Project with Corrections ${ts}`,
      }),
    });
    const caseRes = await casesPostHandler(caseReq);
    assert.equal(caseRes.status, 400, 'Must reject case creation when corrections are pending');
    const json = await caseRes.json();
    assert.ok(json.error.toLowerCase().includes('correction'));
  });

  it('6e. Creator regains editing access, updates project, and resubmits after correction', async () => {
    // Creator edits project during correction cycle
    const patchReq = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({
        description: `Updated project scope during correction cycle ${ts}`,
      }),
    });
    const patchRes = await projectDetailPatchHandler(patchReq, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(patchRes.status, 200, 'Creator must be able to edit during correction cycle');

    // Creator resubmits
    const resubmitReq = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/resubmit`, {
      method: 'POST',
      headers: { cookie: projOfficerCookie },
    });
    const resubmitRes = await projectResubmitHandler(resubmitReq, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(resubmitRes.status, 200);
    const resubmitJson = await resubmitRes.json();
    assert.equal(resubmitJson.data.correctionPendingFor, null, 'correctionPendingFor must be cleared');
    assert.equal(resubmitJson.data.status, 'SUBMITTED', 'Project must return to SUBMITTED status');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Project is Accepted -> LAND_OFFICER can create Acquisition Case
  // ──────────────────────────────────────────────────────────────────────────────

  it('3a. Counterpart reviewers accept both projects (SUBMITTED -> ACCEPTED)', async () => {
    // MINISTRY_ADMIN accepts PO project
    const reviewReq1 = new NextRequest(`http://localhost:3000/api/projects/${projOfficerProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ministryAdminCookie },
      body: JSON.stringify({ decision: 'ACCEPT', remarks: 'Project accepted' }),
    });
    const reviewRes1 = await projectReviewHandler(reviewReq1, { params: Promise.resolve({ id: projOfficerProjectId }) });
    assert.equal(reviewRes1.status, 200);
    assert.equal((await reviewRes1.json()).data.status, 'ACCEPTED');

    // PROJECT_OFFICER accepts MA project
    const reviewReq2 = new NextRequest(`http://localhost:3000/api/projects/${ministryCreatedProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: projOfficerCookie },
      body: JSON.stringify({ decision: 'ACCEPT', remarks: 'Project accepted by PO' }),
    });
    const reviewRes2 = await projectReviewHandler(reviewReq2, { params: Promise.resolve({ id: ministryCreatedProjectId }) });
    assert.equal(reviewRes2.status, 200);
    assert.equal((await reviewRes2.json()).data.status, 'ACCEPTED');
  });

  it('3b. Project is accepted -> LAND_OFFICER can create an acquisition case (201 Created)', async () => {
    const caseReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: landOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `Active Highway Acquisition Case ${ts}`,
        description: 'Case created on accepted project',
      }),
    });
    const caseRes = await casesPostHandler(caseReq);
    assert.equal(caseRes.status, 201, 'LAND_OFFICER must be able to create case on ACCEPTED project');
    const json = await caseRes.json();
    activeCaseId = json.data.id;
    createdCaseIds.push(activeCaseId);
    assert.equal(json.data.createdBy, landOfficerId);
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: Newly created acquisition case -> NO opponent-role approval required
  // ──────────────────────────────────────────────────────────────────────────────

  it('7. Newly created case enters AWAITING_FIELD_VERIFICATION immediately (no opponent approval needed)', async () => {
    assert.ok(activeCaseId, 'Case must exist');
    const getReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${activeCaseId}`, {
      headers: { cookie: landOfficerCookie },
    });
    const getRes = await caseDetailGetHandler(getReq, { params: Promise.resolve({ id: activeCaseId }) });
    assert.equal(getRes.status, 200);
    const json = await getRes.json();
    assert.equal(
      json.data.status,
      'AWAITING_FIELD_VERIFICATION',
      'Case status must be AWAITING_FIELD_VERIFICATION directly on creation'
    );
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: FIELD_OFFICER can immediately access newly created case
  // ──────────────────────────────────────────────────────────────────────────────

  it('8. FIELD_OFFICER can immediately access newly created case within authorized scope (200 OK)', async () => {
    assert.ok(activeCaseId, 'Case must exist');
    const getReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${activeCaseId}`, {
      headers: { cookie: fieldOfficerCookie },
    });
    const getRes = await caseDetailGetHandler(getReq, { params: Promise.resolve({ id: activeCaseId }) });
    assert.equal(getRes.status, 200, 'FIELD_OFFICER must be able to view case');
    const json = await getRes.json();
    assert.equal(json.data.id, activeCaseId);
    assert.equal(json.data.status, 'AWAITING_FIELD_VERIFICATION');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: FIELD_OFFICER can immediately create parcel records
  // ──────────────────────────────────────────────────────────────────────────────

  it('9. FIELD_OFFICER can immediately create parcel records on the newly created case (201 Created)', async () => {
    assert.ok(activeCaseId, 'Case must exist');
    const parcelReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${activeCaseId}/parcels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: fieldOfficerCookie },
      body: JSON.stringify({
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru South',
        village: 'Begur',
        surveyNumber: `SY-${ts}`,
        totalArea: 1000,
        areaUnit: 'SQ_M',
        proposedAffectedArea: 500,
        affectedAreaUnit: 'SQ_M',
      }),
    });
    const parcelRes = await parcelsPostHandler(parcelReq, { params: Promise.resolve({ id: activeCaseId }) });
    assert.equal(parcelRes.status, 201, 'FIELD_OFFICER must be able to create parcel record immediately');
    const json = await parcelRes.json();
    assert.ok(json.data.id, 'Parcel record must have an ID');
    createdParcelIds.push(json.data.parcel.id);
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // SCENARIO 10 & 11: Case listing and workflows remain unaffected
  // ──────────────────────────────────────────────────────────────────────────────

  it('10. LAND_OFFICER and FIELD_OFFICER can list active cases ready for verification', async () => {
    const listReq = new NextRequest(`http://localhost:3000/api/acquisition-cases?status=AWAITING_FIELD_VERIFICATION`, {
      headers: { cookie: fieldOfficerCookie },
    });
    const listRes = await casesListHandler(listReq);
    assert.equal(listRes.status, 200);
    const json = await listRes.json();
    assert.ok(Array.isArray(json.data));
    const found = json.data.some((c: { id: string }) => c.id === activeCaseId);
    assert.ok(found, 'Created case must be listed in AWAITING_FIELD_VERIFICATION query');
  });

  it('11. Non-LAND_OFFICER cannot create acquisition cases (403 Forbidden)', async () => {
    // FIELD_OFFICER tries to create a case
    const caseReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: fieldOfficerCookie },
      body: JSON.stringify({
        projectId: projOfficerProjectId,
        title: `FO Tries Case ${ts}`,
      }),
    });
    const caseRes = await casesPostHandler(caseReq);
    assert.equal(caseRes.status, 403, 'FIELD_OFFICER cannot create acquisition cases');
  });
});
