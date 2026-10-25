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
import { permissions } from '../../db/schema/permissions';
import { rolePermissions } from '../../db/schema/role-permissions';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as casesPostHandler } from '../../src/app/api/acquisition-cases/route';
import { GET as caseDetailGetHandler, PATCH as caseDetailPatchHandler } from '../../src/app/api/acquisition-cases/[id]/route';
import { POST as caseSubmitHandler } from '../../src/app/api/acquisition-cases/[id]/submit/route';
import { POST as caseReviewHandler } from '../../src/app/api/acquisition-cases/[id]/review/route';

describe('NLAMS Acquisition Cases — Review Decision & Field Verification Authorization Workflow', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let kaLandOfficerId: string;
  let kaLandOfficerCookie: string;

  let kaProjectOfficerId: string;
  let kaProjectOfficerCookie: string;

  let mhProjectOfficerId: string;
  let mhProjectOfficerCookie: string;

  let reviewOnlyOfficerId: string;
  let reviewOnlyOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let nhaiAgencyId: string;

  let kaProjectId: string;
  let mhProjectId: string;

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

    // 3. Resolve roles & agency
    const [landOffRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [projOffRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    nhaiAgencyId = nhai.id;

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    // 4. Create KA Land Officer (creates and submits cases)
    const [kaLandUser] = await db
      .insert(users)
      .values({
        name: `KA Land Officer RevTest ${ts}`,
        email: `ka.land.rev.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    kaLandOfficerId = kaLandUser.id;
    createdUserIds.push(kaLandOfficerId);

    await db.insert(userRoles).values({
      userId: kaLandOfficerId,
      roleId: landOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: kaLandOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: kaLandToken } = await sessionService.createSession(kaLandOfficerId);
    kaLandOfficerCookie = `${authConfig.cookieName}=${kaLandToken}`;

    // 5. Create KA Project Officer (holds ACQUISITION_CASE_REVIEW & FIELD_VERIFICATION_AUTHORIZE in KA)
    const [kaProjUser] = await db
      .insert(users)
      .values({
        name: `KA Project Officer RevTest ${ts}`,
        email: `ka.proj.rev.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    kaProjectOfficerId = kaProjUser.id;
    createdUserIds.push(kaProjectOfficerId);

    await db.insert(userRoles).values({
      userId: kaProjectOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: kaProjectOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: kaProjToken } = await sessionService.createSession(kaProjectOfficerId);
    kaProjectOfficerCookie = `${authConfig.cookieName}=${kaProjToken}`;

    // 6. Create MH Project Officer (holds review permissions in MH, outside KA scope)
    const [mhProjUser] = await db
      .insert(users)
      .values({
        name: `MH Project Officer RevTest ${ts}`,
        email: `mh.proj.rev.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    mhProjectOfficerId = mhProjUser.id;
    createdUserIds.push(mhProjectOfficerId);

    await db.insert(userRoles).values({
      userId: mhProjectOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: mhProjectOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: mhProjToken } = await sessionService.createSession(mhProjectOfficerId);
    mhProjectOfficerCookie = `${authConfig.cookieName}=${mhProjToken}`;

    // 7. Create a custom role with ACQUISITION_CASE_REVIEW ONLY (lacks FIELD_VERIFICATION_AUTHORIZE)
    const [customReviewRole] = await db
      .insert(roles)
      .values({
        name: `REVIEW_ONLY_ROLE_${ts}`,
        description: 'Role with ACQUISITION_CASE_REVIEW only',
        isSystemRole: false,
      })
      .returning({ id: roles.id });
    createdRoleIds.push(customReviewRole.id);

    const [reviewPerm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.name, 'ACQUISITION_CASE_REVIEW'))
      .limit(1);
    const [viewPerm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.name, 'ACQUISITION_CASE_VIEW'))
      .limit(1);

    if (reviewPerm && viewPerm) {
      await db.insert(rolePermissions).values([
        { roleId: customReviewRole.id, permissionId: reviewPerm.id },
        { roleId: customReviewRole.id, permissionId: viewPerm.id },
      ]);
    }

    const [reviewOnlyUser] = await db
      .insert(users)
      .values({
        name: `Review Only Officer ${ts}`,
        email: `review.only.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    reviewOnlyOfficerId = reviewOnlyUser.id;
    createdUserIds.push(reviewOnlyOfficerId);

    await db.insert(userRoles).values({
      userId: reviewOnlyOfficerId,
      roleId: customReviewRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: reviewOnlyOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: reviewOnlyToken } = await sessionService.createSession(reviewOnlyOfficerId);
    reviewOnlyOfficerCookie = `${authConfig.cookieName}=${reviewOnlyToken}`;

    // 8. Create Projects in KA and MH
    const [projKA] = await db
      .insert(projects)
      .values({
        projectCode: `KA-REV-${ts}`,
        name: `Karnataka Review Test Highway ${ts}`,
        projectType: 'Highway',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: nhaiAgencyId,
        plannedStartDate: '2026-03-01',
        plannedEndDate: '2028-12-31',
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    kaProjectId = projKA.id;
    createdProjectIds.push(kaProjectId);

    const [projMH] = await db
      .insert(projects)
      .values({
        projectCode: `MH-REV-${ts}`,
        name: `Maharashtra Review Test Expressway ${ts}`,
        projectType: 'Highway',
        status: 'REGISTERED',
        administrativeUnitId: unitIdMH,
        implementingAgencyId: nhaiAgencyId,
        plannedStartDate: '2026-04-01',
        plannedEndDate: '2029-06-30',
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    mhProjectId = projMH.id;
    createdProjectIds.push(mhProjectId);
  });

  after(async () => {
    try {
      // Cleanup created test resources in order
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
      if (createdRoleIds.length > 0) {
        await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, createdRoleIds));
        await db.delete(roles).where(inArray(roles.id, createdRoleIds));
      }
    } finally {
      await client.end();
    }
  });

  // Helper to create and submit a fresh case in KA
  async function createAndSubmitCase(titleSuffix: string): Promise<string> {
    const createReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({
        projectId: kaProjectId,
        title: `Case for ${titleSuffix} ${ts}`,
        description: 'Initial draft for review testing',
      }),
    });
    const createRes = await casesPostHandler(createReq);
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    const caseId = createJson.data.id;
    createdCaseIds.push(caseId);

    const submitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({ remarks: `Submitting case ${titleSuffix}` }),
    });
    const submitRes = await caseSubmitHandler(submitReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(submitRes.status, 200);
    return caseId;
  }

  it('1. Authorizes field verification: transitions SUBMITTED -> AWAITING_FIELD_VERIFICATION with audit history', async () => {
    const caseId = await createAndSubmitCase('Field Verification Auth');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'Preliminary alignment verified. Field verification authorized.',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200, 'Permitting field verification must succeed with 200 OK');

    const json = await reviewRes.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'AWAITING_FIELD_VERIFICATION');

    // Verify DB state and atomic audit history
    const detailReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}`, {
      headers: { cookie: kaProjectOfficerCookie },
    });
    const detailRes = await caseDetailGetHandler(detailReq, { params: Promise.resolve({ id: caseId }) });
    const detailJson = await detailRes.json();

    assert.equal(detailJson.data.status, 'AWAITING_FIELD_VERIFICATION');
    const history = detailJson.data.workflowHistory;
    assert.ok(history.length >= 3, 'History must contain CREATE, SUBMIT, and review decision');

    const reviewEntry = history[0]; // Latest first
    assert.equal(reviewEntry.action, 'PERMIT_FIELD_VERIFICATION');
    assert.equal(reviewEntry.fromStatus, 'SUBMITTED');
    assert.equal(reviewEntry.toStatus, 'AWAITING_FIELD_VERIFICATION');
    assert.equal(reviewEntry.actorId, kaProjectOfficerId);
    assert.equal(reviewEntry.remarks, 'Preliminary alignment verified. Field verification authorized.');
    assert.ok(reviewEntry.createdAt);
  });

  it('2. Also accepts AUTHORIZE_FIELD_VERIFICATION alias and optional remarks', async () => {
    const caseId = await createAndSubmitCase('Alias Auth');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'AUTHORIZE_FIELD_VERIFICATION',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200);
    const json = await reviewRes.json();
    assert.equal(json.data.status, 'AWAITING_FIELD_VERIFICATION');
  });

  it('3. Returns for correction: transitions SUBMITTED -> RETURNED_FOR_CORRECTION with mandatory remarks', async () => {
    const caseId = await createAndSubmitCase('Return For Correction');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'RETURN_FOR_CORRECTION',
        remarks: 'Please clarify survey numbers for Taluk sector 3.',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200);

    const json = await reviewRes.json();
    assert.equal(json.data.status, 'RETURNED_FOR_CORRECTION');

    const detailReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}`, {
      headers: { cookie: kaProjectOfficerCookie },
    });
    const detailRes = await caseDetailGetHandler(detailReq, { params: Promise.resolve({ id: caseId }) });
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.workflowHistory[0].action, 'RETURN_FOR_CORRECTION');
    assert.equal(detailJson.data.workflowHistory[0].toStatus, 'RETURNED_FOR_CORRECTION');
  });

  it('4. Rejects acquisition case: transitions SUBMITTED -> REJECTED with mandatory reason', async () => {
    const caseId = await createAndSubmitCase('Case Rejection');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'REJECT',
        reason: 'Proposed land alignment directly conflicts with protected sanctuary buffer.',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 200);

    const json = await reviewRes.json();
    assert.equal(json.data.status, 'REJECTED');

    const detailReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}`, {
      headers: { cookie: kaProjectOfficerCookie },
    });
    const detailRes = await caseDetailGetHandler(detailReq, { params: Promise.resolve({ id: caseId }) });
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.workflowHistory[0].action, 'REJECT');
    assert.equal(detailJson.data.workflowHistory[0].toStatus, 'REJECTED');
  });

  it('5. Mandatory remarks enforcement: RETURN_FOR_CORRECTION requires remarks', async () => {
    const caseId = await createAndSubmitCase('Missing Return Remarks');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'RETURN_FOR_CORRECTION',
        remarks: '   ',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 400, 'Blank remarks on return must be rejected with 400 Bad Request');
    const json = await reviewRes.json();
    assert.equal(json.success, false);
    assert.match(json.error, /remarks are mandatory/i);
  });

  it('6. Mandatory remarks enforcement: REJECT requires reason/remarks', async () => {
    const caseId = await createAndSubmitCase('Missing Reject Reason');

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'REJECT',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 400, 'Missing rejection reason must be rejected with 400 Bad Request');
    const json = await reviewRes.json();
    assert.equal(json.success, false);
    assert.match(json.error, /rejection reason is mandatory/i);
  });

  it('7. Rejects invalid transition: Reviewing a case in DRAFT status is rejected (400 Bad Request)', async () => {
    // Create draft case without submitting
    const draftReq = new NextRequest('http://localhost:3000/api/acquisition-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({
        projectId: kaProjectId,
        title: `Draft Review Attempt Case ${ts}`,
      }),
    });
    const draftRes = await casesPostHandler(draftReq);
    const draftJson = await draftRes.json();
    const caseId = draftJson.data.id;
    createdCaseIds.push(caseId);

    const reviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'premature review',
      }),
    });

    const reviewRes = await caseReviewHandler(reviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(reviewRes.status, 400, 'Reviewing DRAFT case must return 400 Bad Request');
    const json = await reviewRes.json();
    assert.match(json.error, /only cases in SUBMITTED status can be reviewed/i);
  });

  it('8. Concurrency & duplicate decision protection: Reviewing an already reviewed case returns 409 Conflict', async () => {
    const caseId = await createAndSubmitCase('Duplicate Review Protection');

    // First decision: permit field verification
    const reviewReq1 = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'First review decision',
      }),
    });
    const res1 = await caseReviewHandler(reviewReq1, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res1.status, 200);

    // Second decision on the now AWAITING_FIELD_VERIFICATION case
    const reviewReq2 = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'REJECT',
        reason: 'Conflicting second review attempt',
      }),
    });
    const res2 = await caseReviewHandler(reviewReq2, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res2.status, 409, 'Subsequent or duplicate review on non-SUBMITTED case must return 409 Conflict');
    const json = await res2.json();
    assert.match(json.error, /already been reviewed/i);
  });

  it('9. Resubmission workflow: RETURNED_FOR_CORRECTION -> edited -> SUBMITTED -> reviewed', async () => {
    const caseId = await createAndSubmitCase('Resubmission Lifecycle');

    // 1. Reviewer returns case for correction
    const returnReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'RETURN_FOR_CORRECTION',
        remarks: 'Please update title with official gazette reference.',
      }),
    });
    const returnRes = await caseReviewHandler(returnReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(returnRes.status, 200);

    // 2. Submitting officer edits case (allowed in RETURNED_FOR_CORRECTION status)
    const patchReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({
        title: `Gazette Ref 2026/04 - Corrected Case ${ts}`,
        description: 'Updated with gazette notification details as requested.',
      }),
    });
    const patchRes = await caseDetailPatchHandler(patchReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(patchRes.status, 200, 'Editing returned case must succeed');
    const patchJson = await patchRes.json();
    assert.equal(patchJson.data.title, `Gazette Ref 2026/04 - Corrected Case ${ts}`);
    assert.equal(patchJson.data.status, 'RETURNED_FOR_CORRECTION');

    // 3. Submitting officer resubmits case
    const resubmitReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({ remarks: 'Resubmitting with gazette reference updated.' }),
    });
    const resubmitRes = await caseSubmitHandler(resubmitReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(resubmitRes.status, 200, 'Resubmission must succeed');
    const resubmitJson = await resubmitRes.json();
    assert.equal(resubmitJson.data.status, 'SUBMITTED');

    // 4. Reviewer can now review again and authorize field verification
    const finalReviewReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'Correction verified. Field verification authorized.',
      }),
    });
    const finalReviewRes = await caseReviewHandler(finalReviewReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(finalReviewRes.status, 200);
    const finalJson = await finalReviewRes.json();
    assert.equal(finalJson.data.status, 'AWAITING_FIELD_VERIFICATION');
  });

  it('10. Permission enforcement: User without ACQUISITION_CASE_REVIEW cannot review case (403 Forbidden)', async () => {
    const caseId = await createAndSubmitCase('No Review Permission');

    // Land Officer lacks ACQUISITION_CASE_REVIEW
    const unauthReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaLandOfficerCookie },
      body: JSON.stringify({
        decision: 'RETURN_FOR_CORRECTION',
        remarks: 'Unauthorized return attempt',
      }),
    });

    const unauthRes = await caseReviewHandler(unauthReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(unauthRes.status, 403, 'User without ACQUISITION_CASE_REVIEW must receive 403 Forbidden');
  });

  it('11. Permission enforcement: User with ACQUISITION_CASE_REVIEW but without FIELD_VERIFICATION_AUTHORIZE cannot permit field verification (403 Forbidden)', async () => {
    const caseId = await createAndSubmitCase('Missing Field Auth Perm');

    // Officer has ACQUISITION_CASE_REVIEW only
    const permitAttemptReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: reviewOnlyOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'Attempting to authorize field verification without permission',
      }),
    });

    const permitRes = await caseReviewHandler(permitAttemptReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(permitRes.status, 403, 'Permitting field verification without FIELD_VERIFICATION_AUTHORIZE must receive 403 Forbidden');

    // However, the same user CAN return for correction!
    const returnReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: reviewOnlyOfficerCookie },
      body: JSON.stringify({
        decision: 'RETURN_FOR_CORRECTION',
        remarks: 'Allowed review return action by reviewer',
      }),
    });
    const returnRes = await caseReviewHandler(returnReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(returnRes.status, 200, 'User with ACQUISITION_CASE_REVIEW must be able to return for correction');
  });

  it('12. Administrative scope enforcement: Cross-scope reviewer cannot review out-of-scope case (403 Forbidden)', async () => {
    const caseId = await createAndSubmitCase('Cross Scope Review');

    // Maharashtra Project Officer has permissions, but only for MH administrative unit
    const crossScopeReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: mhProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'Cross-scope review attempt',
      }),
    });

    const crossScopeRes = await caseReviewHandler(crossScopeReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(crossScopeRes.status, 403, 'Cross-scope review must be rejected with 403 Forbidden');
    const json = await crossScopeRes.json();
    assert.match(json.error, /outside your authorized administrative scope/i);
  });

  it('13. Unauthenticated requests are rejected with 401 Unauthorized', async () => {
    const caseId = createdCaseIds[0];

    const unauthReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
      }),
    });

    const unauthRes = await caseReviewHandler(unauthReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(unauthRes.status, 401, 'Unauthenticated review request must return 401');
  });

  it('14. Never trusts client input for reviewer ID or status', async () => {
    const caseId = await createAndSubmitCase('Client Tampering Protection');

    const tamperReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: kaProjectOfficerCookie },
      body: JSON.stringify({
        decision: 'PERMIT_FIELD_VERIFICATION',
        remarks: 'Legitimate decision with spoofed fields in payload',
        // Client attempting to forge reviewer or resulting status
        reviewerId: '00000000-0000-0000-0000-000000000000',
        actorId: '00000000-0000-0000-0000-000000000000',
        status: 'TAMPERED_STATUS',
        toStatus: 'TAMPERED_STATUS',
      }),
    });

    const tamperRes = await caseReviewHandler(tamperReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(tamperRes.status, 200);

    const json = await tamperRes.json();
    assert.equal(json.data.status, 'AWAITING_FIELD_VERIFICATION', 'Status must be set by server state machine only');

    const detailReq = new NextRequest(`http://localhost:3000/api/acquisition-cases/${caseId}`, {
      headers: { cookie: kaProjectOfficerCookie },
    });
    const detailRes = await caseDetailGetHandler(detailReq, { params: Promise.resolve({ id: caseId }) });
    const detailJson = await detailRes.json();

    const latestHistory = detailJson.data.workflowHistory[0];
    assert.equal(latestHistory.actorId, kaProjectOfficerId, 'Actor ID must always be authenticated session user');
    assert.equal(latestHistory.toStatus, 'AWAITING_FIELD_VERIFICATION');
  });
});
