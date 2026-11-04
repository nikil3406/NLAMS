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
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../db/schema/field-verification-evidence';
import { fieldVerificationReportReviews } from '../../db/schema/field-verification-report-reviews';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as reportReviewHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/review/route';
import { POST as reportCorrectHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/correct/route';
import { GET as verificationSummaryHandler } from '../../src/app/api/acquisition-cases/[id]/verification-summary/route';
import { GET as reviewQueueHandler } from '../../src/app/api/field-verification-reviews/route';
import { POST as reportSubmitHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/submit/route';
import { POST as reportCreateHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/route';
import { fieldVerificationReportService } from '../../src/services/field-verification-reports';

describe('NLAMS — Step 5B: Land Officer Review Workflow and Case Summary', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  // KA Field Officer (Author)
  let fieldOfficerAuthorId: string;
  let fieldOfficerAuthorCookie: string;

  // Second KA Field Officer (Non-author)
  let fieldOfficerOtherId: string;
  let fieldOfficerOtherCookie: string;

  // KA Land Officer 1 (Authorized Reviewer)
  let landOfficer1Id: string;
  let landOfficer1Cookie: string;

  // KA Land Officer 2 (Concurrent/Second Reviewer)
  let landOfficer2Id: string;
  let landOfficer2Cookie: string;

  // Dual-role user (holds both FIELD_OFFICER and LAND_OFFICER)
  let dualRoleUserId: string;
  let dualRoleUserCookie: string;

  // MH Land Officer (Out-of-scope for KA cases)
  let mhLandOfficerId: string;
  let mhLandOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  // Cases
  let awaitingVerifCaseId: string;
  let mixedUnitsCaseId: string;

  // Parcels
  let parcel1Id: string;
  let caseParcel1Id: string;

  let parcel2Id: string;
  let caseParcel2Id: string;

  let parcel3Id: string;
  let caseParcel3Id: string;

  // Mixed units case parcels
  let mixedCaseParcel1Id: string;
  let mixedCaseParcel2Id: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found. Run seed first.');
    superAdminId = sa.id;

    // 2. Resolve Admin Units
    const [ka] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    unitIdKA = ka.id;

    const [mh] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'MH'))
      .limit(1);
    unitIdMH = mh.id;

    // 3. Resolve Implementing Agency
    const [agency] = await db.select({ id: implementingAgencies.id }).from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 4. Resolve Roles
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const makeUser = async (nameSuffix: string, emailPrefix: string) => {
      const [u] = await db
        .insert(users)
        .values({
          name: `${nameSuffix} ${ts}`,
          email: `${emailPrefix}.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status: 'ACTIVE',
        })
        .returning({ id: users.id });
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

    superAdminCookie = await makeSession(superAdminId);

    // 1. KA Field Officer (Author)
    fieldOfficerAuthorId = await makeUser('KA Field Officer Author', 'fo.author');
    await assignRole(fieldOfficerAuthorId, foRole.id);
    await assignUnit(fieldOfficerAuthorId, unitIdKA);
    fieldOfficerAuthorCookie = await makeSession(fieldOfficerAuthorId);

    // 2. KA Field Officer (Other)
    fieldOfficerOtherId = await makeUser('KA Field Officer Other', 'fo.other');
    await assignRole(fieldOfficerOtherId, foRole.id);
    await assignUnit(fieldOfficerOtherId, unitIdKA);
    fieldOfficerOtherCookie = await makeSession(fieldOfficerOtherId);

    // 3. KA Land Officer 1 (Reviewer)
    landOfficer1Id = await makeUser('KA Land Officer Reviewer 1', 'lo.reviewer1');
    await assignRole(landOfficer1Id, loRole.id);
    await assignUnit(landOfficer1Id, unitIdKA);
    landOfficer1Cookie = await makeSession(landOfficer1Id);

    // 4. KA Land Officer 2 (Reviewer)
    landOfficer2Id = await makeUser('KA Land Officer Reviewer 2', 'lo.reviewer2');
    await assignRole(landOfficer2Id, loRole.id);
    await assignUnit(landOfficer2Id, unitIdKA);
    landOfficer2Cookie = await makeSession(landOfficer2Id);

    // 5. Dual Role User (holds FO & LO)
    dualRoleUserId = await makeUser('Dual Role Officer', 'dual.officer');
    await assignRole(dualRoleUserId, foRole.id);
    await assignRole(dualRoleUserId, loRole.id);
    await assignUnit(dualRoleUserId, unitIdKA);
    dualRoleUserCookie = await makeSession(dualRoleUserId);

    // 6. MH Land Officer (Out of scope)
    mhLandOfficerId = await makeUser('MH Land Officer', 'mh.lo.reviewer');
    await assignRole(mhLandOfficerId, loRole.id);
    await assignUnit(mhLandOfficerId, unitIdMH);
    mhLandOfficerCookie = await makeSession(mhLandOfficerId);

    // Create Projects
    const [kaProj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-5B-KA-${ts}`,
        name: `Step 5B Project KA ${ts}`,
        projectType: 'METRO',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    createdProjectIds.push(kaProj.id);

    // Primary Acquisition Case in AWAITING_FIELD_VERIFICATION
    const [c1] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-5B-${ts}`,
        projectId: kaProj.id,
        title: `Step 5B Verification Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficer1Id,
        updatedBy: landOfficer1Id,
      })
      .returning({ id: acquisitionCases.id });
    awaitingVerifCaseId = c1.id;
    createdCaseIds.push(c1.id);

    // Second Case for Testing Incompatible Area Units
    const [c2] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-5B-MIXED-${ts}`,
        projectId: kaProj.id,
        title: `Step 5B Mixed Units Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficer1Id,
        updatedBy: landOfficer1Id,
      })
      .returning({ id: acquisitionCases.id });
    mixedUnitsCaseId = c2.id;
    createdCaseIds.push(c2.id);

    // Create 3 standard parcels in SQ_M (compatible)
    const makeParcel = async (survey: string, totalArea: string, unit = 'SQ_M') => {
      const pId = `P-5B-${survey}-${ts}`;
      const [p] = await db
        .insert(landParcels)
        .values({
          parcelId: pId,
          administrativeUnitId: unitIdKA,
          state: 'Karnataka',
          district: 'Bengaluru Urban',
          taluk: 'Bengaluru North',
          village: 'Yelahanka',
          surveyNumber: survey,
          totalArea,
          areaUnit: unit,
          createdBy: superAdminId,
        })
        .returning({ id: landParcels.id });
      createdParcelIds.push(p.id);
      return p.id;
    };

    parcel1Id = await makeParcel('101', '1200.0000', 'SQ_M');
    parcel2Id = await makeParcel('102', '1800.0000', 'SQ_M');
    parcel3Id = await makeParcel('103', '2000.0000', 'SQ_M');

    // Link parcels to Case 1 (compatible SQ_M)
    const linkCaseParcel = async (caseId: string, parcelId: string, proposedArea: string, unit = 'SQ_M') => {
      const [cp] = await db
        .insert(acquisitionCaseParcels)
        .values({
          caseId,
          parcelId,
          proposedAffectedArea: proposedArea,
          affectedAreaUnit: unit,
          createdBy: landOfficer1Id,
        })
        .returning({ id: acquisitionCaseParcels.id });
      createdCaseParcelIds.push(cp.id);
      return cp.id;
    };

    caseParcel1Id = await linkCaseParcel(awaitingVerifCaseId, parcel1Id, '500.0000', 'SQ_M');
    caseParcel2Id = await linkCaseParcel(awaitingVerifCaseId, parcel2Id, '750.0000', 'SQ_M');
    caseParcel3Id = await linkCaseParcel(awaitingVerifCaseId, parcel3Id, '850.0000', 'SQ_M');

    // Create parcels for Case 2 with MIXED units (SQ_M vs ACRE)
    const mixedParcel1 = await makeParcel('201', '1000.0000', 'SQ_M');
    const mixedParcel2 = await makeParcel('202', '2.5000', 'ACRE');
    mixedCaseParcel1Id = await linkCaseParcel(mixedUnitsCaseId, mixedParcel1, '400.0000', 'SQ_M');
    mixedCaseParcel2Id = await linkCaseParcel(mixedUnitsCaseId, mixedParcel2, '1.2500', 'ACRE');
  });

  after(async () => {
    // Cleanup in reverse dependency order
    if (createdReportIds.length > 0) {
      await db.delete(fieldVerificationReportReviews).where(inArray(fieldVerificationReportReviews.reportId, createdReportIds));
      await db.delete(fieldVerificationEvidence).where(inArray(fieldVerificationEvidence.reportId, createdReportIds));
      await db.delete(fieldVerificationReports).where(inArray(fieldVerificationReports.id, createdReportIds));
    }
    if (createdCaseParcelIds.length > 0) {
      await db.delete(acquisitionCaseParcels).where(inArray(acquisitionCaseParcels.id, createdCaseParcelIds));
    }
    if (createdParcelIds.length > 0) {
      await db.delete(landParcels).where(inArray(landParcels.id, createdParcelIds));
    }
    if (createdCaseIds.length > 0) {
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
  });

  function makeReq(
    method: string,
    url: string,
    cookie?: string,
    body?: Record<string, unknown>
  ): NextRequest {
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Helper to create and submit a verification report
  async function createAndSubmitReport(
    caseParcelId: string,
    authorCookie: string,
    outcome: 'VERIFIED' | 'DISCREPANCY_FOUND' | 'INCONCLUSIVE' = 'VERIFIED'
  ): Promise<string> {
    const createReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      authorCookie,
      {
        verificationDate: new Date().toISOString(),
        outcome,
        observations: 'Initial boundary inspection completed without obstruction.',
        measuredArea: 495.5,
        measuredAreaUnit: 'SQ_M',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: `evid_p_${ts}_${Math.random().toString(36).slice(2, 7)}`,
            caption: 'Survey boundary marker photo',
          },
        ],
      }
    );
    const createRes = await reportCreateHandler(createReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    const rptId = createJson.data.id;
    createdReportIds.push(rptId);

    const submitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${rptId}/submit`,
      authorCookie,
      {}
    );
    const submitRes = await reportSubmitHandler(submitReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: rptId }),
    });
    assert.equal(submitRes.status, 200);
    return rptId;
  }

  // --------------------------------------------------------------------------
  // Category 1: Unauthenticated and unauthorized review attempts
  // --------------------------------------------------------------------------

  it('1. Unauthenticated review attempt returns 401 Unauthorized', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      undefined,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 401);
  });

  it('2. Unauthorized review attempt: FIELD_OFFICER cannot review reports (403 Forbidden)', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      fieldOfficerOtherCookie,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Only an authorized Land Officer/i);
  });

  // --------------------------------------------------------------------------
  // Category 2: Out-of-scope case access
  // --------------------------------------------------------------------------

  it('3. Cross-jurisdiction review: MH Land Officer cannot review KA case report (404/403)', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      mhLandOfficerCookie,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.ok(res.status === 403 || res.status === 404);
  });

  // --------------------------------------------------------------------------
  // Category 3: Self-review prevention (Separation of duties)
  // --------------------------------------------------------------------------

  it('4. Separation of duties: Report author cannot review their own report (403 Forbidden)', async () => {
    // Dual role user (holds LO & FO) creates and submits report
    const rptId = await createAndSubmitReport(caseParcel1Id, dualRoleUserCookie);

    // Dual role user attempts to review their own report
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      dualRoleUserCookie,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /separation of duties/i);
  });

  it('5. SUPER_ADMIN cannot bypass separation of duties to self-review a report they authored', async () => {
    // Super admin authors a report
    const createReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports`,
      superAdminCookie,
      {
        verificationDate: new Date().toISOString(),
        outcome: 'VERIFIED',
        observations: 'Admin field inspection.',
        evidence: [
          { evidenceType: 'PHOTO', fileReference: `evid_sa_${ts}`, caption: 'SA photo' },
        ],
      }
    );
    // Note: If super admin creates directly in DB with createdBy: superAdminId
    const [inserted] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: caseParcel1Id,
        verificationDate: new Date(),
        outcome: 'VERIFIED',
        observations: 'Super Admin inspection observations.',
        status: 'SUBMITTED',
        createdBy: superAdminId,
        verifiedBy: superAdminId,
        submittedAt: new Date(),
      })
      .returning();
    createdReportIds.push(inserted.id);

    // Super Admin attempts to review their own authored report
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${inserted.id}/review`,
      superAdminCookie,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: inserted.id }),
    });
    assert.equal(res.status, 403, 'SUPER_ADMIN must not bypass separation of duties');
    const json = await res.json();
    assert.match(json.error, /separation of duties/i);
  });

  // --------------------------------------------------------------------------
  // Category 4: Reviewing drafts or already-reviewed reports
  // --------------------------------------------------------------------------

  it('6. Cannot review a report that is still in DRAFT status (400 Bad Request)', async () => {
    // Create draft without submitting
    const [draftRpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: caseParcel1Id,
        verificationDate: new Date(),
        outcome: 'VERIFIED',
        observations: 'Unsubmitted draft observations.',
        status: 'DRAFT',
        createdBy: fieldOfficerAuthorId,
      })
      .returning();
    createdReportIds.push(draftRpt.id);

    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${draftRpt.id}/review`,
      landOfficer1Cookie,
      { decision: 'ACCEPTED' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: draftRpt.id }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /still in DRAFT status/i);
  });

  it('7. Cannot review an already-reviewed report (409 Conflict)', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    // First review: Accept
    const req1 = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      { decision: 'ACCEPTED', remarks: 'All clear.' }
    );
    const res1 = await reportReviewHandler(req1, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res1.status, 200);

    // Second review attempt: Return for correction
    const req2 = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer2Cookie,
      { decision: 'RETURNED_FOR_CORRECTION', remarks: 'Late return attempt.' }
    );
    const res2 = await reportReviewHandler(req2, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res2.status, 409);
    const json = await res2.json();
    assert.match(json.error, /already been reviewed/i);
  });

  // --------------------------------------------------------------------------
  // Category 5: Valid decisions and required remarks
  // --------------------------------------------------------------------------

  it('8. ACCEPTED decision succeeds with optional remarks and transitions to ACCEPTED', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      { decision: 'ACCEPTED', remarks: 'Verified on site.' }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'ACCEPTED');
    assert.equal(json.data.reviewDecision, 'ACCEPTED');
    assert.equal(json.data.reviewedBy, landOfficer1Id);
    assert.ok(json.data.reviewedAt);
    assert.equal(json.data.reviewRemarks, 'Verified on site.');
  });

  it('9. RETURNED_FOR_CORRECTION requires remarks (minimum 5 chars) (400 Bad Request)', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    // Missing remarks
    const reqEmpty = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      { decision: 'RETURNED_FOR_CORRECTION', remarks: '' }
    );
    const resEmpty = await reportReviewHandler(reqEmpty, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(resEmpty.status, 400);

    // Remarks too short
    const reqShort = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      { decision: 'RETURNED_FOR_CORRECTION', remarks: 'Fix' }
    );
    const resShort = await reportReviewHandler(reqShort, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(resShort.status, 400);
  });

  it('10. RETURNED_FOR_CORRECTION with valid remarks transitions to RETURNED_FOR_CORRECTION', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      {
        decision: 'RETURNED_FOR_CORRECTION',
        remarks: 'Please re-measure the eastern perimeter boundary fence.',
      }
    );
    const res = await reportReviewHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'RETURNED_FOR_CORRECTION');
    assert.equal(json.data.reviewDecision, 'RETURNED_FOR_CORRECTION');
    assert.equal(json.data.reviewRemarks, 'Please re-measure the eastern perimeter boundary fence.');
  });

  it('11. DISCREPANCY_FLAGGED requires mandatory reason and transitions to DISCREPANCY_FLAGGED', async () => {
    const rptId = await createAndSubmitReport(caseParcel2Id, fieldOfficerAuthorCookie);

    // Empty reason rejected
    const reqEmpty = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel2Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      { decision: 'DISCREPANCY_FLAGGED', remarks: '   ' }
    );
    const resEmpty = await reportReviewHandler(reqEmpty, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel2Id, reportId: rptId }),
    });
    assert.equal(resEmpty.status, 400);

    // Valid reason accepted
    const reqValid = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel2Id}/reports/${rptId}/review`,
      landOfficer1Cookie,
      {
        decision: 'DISCREPANCY_FLAGGED',
        remarks: 'Substantial 25% discrepancy found between revenue survey map and ground physical boundary.',
      }
    );
    const resValid = await reportReviewHandler(reqValid, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel2Id, reportId: rptId }),
    });
    assert.equal(resValid.status, 200);
    const json = await resValid.json();
    assert.equal(json.data.status, 'DISCREPANCY_FLAGGED');
    assert.equal(json.data.reviewDecision, 'DISCREPANCY_FLAGGED');
  });

  // --------------------------------------------------------------------------
  // Category 6: Audit actor, timestamps, and history table
  // --------------------------------------------------------------------------

  it('12. Audit actor and timestamps are recorded in field_verification_report_reviews table', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    const reviewReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
      landOfficer2Cookie,
      { decision: 'ACCEPTED', remarks: 'Audited and verified.' }
    );
    const res = await reportReviewHandler(reviewReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(res.status, 200);

    // Inspect database review history table directly
    const historyRows = await db
      .select()
      .from(fieldVerificationReportReviews)
      .where(eq(fieldVerificationReportReviews.reportId, rptId));

    assert.equal(historyRows.length, 1);
    const [auditEntry] = historyRows;
    assert.equal(auditEntry.reviewerId, landOfficer2Id);
    assert.equal(auditEntry.decision, 'ACCEPTED');
    assert.equal(auditEntry.fromStatus, 'SUBMITTED');
    assert.equal(auditEntry.toStatus, 'ACCEPTED');
    assert.equal(auditEntry.remarks, 'Audited and verified.');
    assert.ok(auditEntry.createdAt instanceof Date);
  });

  // --------------------------------------------------------------------------
  // Category 7: Concurrent/conflicting review decisions
  // --------------------------------------------------------------------------

  it('13. Concurrency protection: Serialized conditional update prevents conflicting decisions', async () => {
    const rptId = await createAndSubmitReport(caseParcel1Id, fieldOfficerAuthorCookie);

    // Simulate two concurrent review calls
    const [resA, resB] = await Promise.all([
      reportReviewHandler(
        makeReq(
          'POST',
          `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
          landOfficer1Cookie,
          { decision: 'ACCEPTED', remarks: 'First reviewer accepts.' }
        ),
        { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }) }
      ),
      reportReviewHandler(
        makeReq(
          'POST',
          `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel1Id}/reports/${rptId}/review`,
          landOfficer2Cookie,
          {
            decision: 'RETURNED_FOR_CORRECTION',
            remarks: 'Concurrent reviewer attempts return.',
          }
        ),
        { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel1Id, reportId: rptId }) }
      ),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(
      statuses,
      [200, 409],
      'Exactly one review must succeed (200) and the conflicting review must be rejected (409)'
    );
  });

  // --------------------------------------------------------------------------
  // Category 8: Correction and resubmission history preservation
  // --------------------------------------------------------------------------

  it('14. Correction workflow: Preserves returned report history and allows author to create revision draft', async () => {
    // 1. Author creates and submits initial report
    const initialReportId = await createAndSubmitReport(caseParcel3Id, fieldOfficerAuthorCookie);

    // 2. Land Officer returns report for correction
    const returnReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel3Id}/reports/${initialReportId}/review`,
      landOfficer1Cookie,
      {
        decision: 'RETURNED_FOR_CORRECTION',
        remarks: 'Please add boundary post photo and confirm measured perimeter.',
      }
    );
    const returnRes = await reportReviewHandler(returnReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel3Id, reportId: initialReportId }),
    });
    assert.equal(returnRes.status, 200);

    // 3. Non-author cannot initiate correction draft (403 Forbidden)
    const otherReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel3Id}/reports/${initialReportId}/correct`,
      fieldOfficerOtherCookie
    );
    const otherRes = await reportCorrectHandler(otherReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel3Id, reportId: initialReportId }),
    });
    assert.equal(otherRes.status, 403);

    // 4. Authorized original author initiates correction draft (201 Created)
    const correctReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel3Id}/reports/${initialReportId}/correct`,
      fieldOfficerAuthorCookie
    );
    const correctRes = await reportCorrectHandler(correctReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel3Id, reportId: initialReportId }),
    });
    assert.equal(correctRes.status, 201);
    const correctJson = await correctRes.json();
    const revisionDraftId = correctJson.data.id;
    createdReportIds.push(revisionDraftId);

    assert.equal(correctJson.data.status, 'DRAFT');
    assert.equal(correctJson.data.previousReportId, initialReportId);
    assert.equal(correctJson.data.revisionNumber, 2);
    // Preserves evidence from previous report
    assert.ok(correctJson.data.evidence.length >= 1);

    // 5. Verify original report remains locked in RETURNED_FOR_CORRECTION status
    const [originalRow] = await db
      .select()
      .from(fieldVerificationReports)
      .where(eq(fieldVerificationReports.id, initialReportId));
    assert.equal(originalRow.status, 'RETURNED_FOR_CORRECTION');
    assert.equal(originalRow.reviewDecision, 'RETURNED_FOR_CORRECTION');
    assert.equal(originalRow.reviewRemarks, 'Please add boundary post photo and confirm measured perimeter.');

    // 6. Author submits the corrected revision
    const submitRevReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel3Id}/reports/${revisionDraftId}/submit`,
      fieldOfficerAuthorCookie,
      {}
    );
    const submitRevRes = await reportSubmitHandler(submitRevReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel3Id, reportId: revisionDraftId }),
    });
    assert.equal(submitRevRes.status, 200);

    // 7. Fresh independent Land Officer reviews and accepts revision 2
    const acceptRevReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcel3Id}/reports/${revisionDraftId}/review`,
      landOfficer2Cookie,
      { decision: 'ACCEPTED', remarks: 'Revision 2 accepted; boundary post photo verified.' }
    );
    const acceptRevRes = await reportReviewHandler(acceptRevReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: caseParcel3Id, reportId: revisionDraftId }),
    });
    assert.equal(acceptRevRes.status, 200);
    const acceptRevJson = await acceptRevRes.json();
    assert.equal(acceptRevJson.data.status, 'ACCEPTED');
    assert.equal(acceptRevJson.data.revisionNumber, 2);
  });

  // --------------------------------------------------------------------------
  // Category 9: Discrepancy flags remaining unresolved
  // --------------------------------------------------------------------------

  it('15. Discrepancy flag leaves finding unresolved and flagged in case summary', async () => {
    // Check summary of awaitingVerifCaseId
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/verification-summary`,
      landOfficer1Cookie
    );
    const res = await verificationSummaryHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data.discrepancyFlaggedReports >= 1, 'Should count discrepancy-flagged report');
    assert.ok(json.data.outstandingDiscrepancies >= 1, 'Discrepancy must remain outstanding / unresolved');

    // Parcel 2 status must be DISCREPANCY_FLAGGED
    const p2Summary = json.data.parcelsSummary.find((p: any) => p.caseParcelId === caseParcel2Id);
    assert.ok(p2Summary);
    assert.equal(p2Summary.currentVerificationStatus, 'DISCREPANCY_FLAGGED');
  });

  // --------------------------------------------------------------------------
  // Category 10: Correct summary counts when parcels have multiple reports
  // --------------------------------------------------------------------------

  it('16. Summary metrics: Unique parcel count is not inflated when parcels have multiple reports', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/verification-summary`,
      landOfficer1Cookie
    );
    const res = await verificationSummaryHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const summary = json.data;

    // We have exactly 3 parcels associated with awaitingVerifCaseId
    assert.equal(summary.totalParcels, 3, 'Total parcels must equal 3 unique parcels');
    assert.equal(summary.parcelsSummary.length, 3, 'Parcels summary list must have exactly 3 entries');

    // Parcel 3 has multiple reports (Revision 1 Returned, Revision 2 Accepted)
    // Parcel 3's current status is determined by Revision 2 (VERIFIED_ACCEPTED)
    const p3Summary = summary.parcelsSummary.find((p: any) => p.caseParcelId === caseParcel3Id);
    assert.ok(p3Summary);
    assert.equal(p3Summary.currentVerificationStatus, 'VERIFIED_ACCEPTED');
    assert.equal(p3Summary.revisionNumber, 2);

    // Reports are counted separately from unique parcels
    assert.ok(summary.acceptedReports >= 1);
    assert.ok(summary.returnedReports >= 1);
  });

  // --------------------------------------------------------------------------
  // Category 11: Area aggregation with compatible and incompatible units
  // --------------------------------------------------------------------------

  it('17. Area aggregation: Compatible units aggregate into single scalar sum', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/verification-summary`,
      landOfficer1Cookie
    );
    const res = await verificationSummaryHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const { recordedParcelArea, proposedAffectedArea } = json.data.areaTotals;

    // All parcels in awaitingVerifCaseId are SQ_M: 1200 + 1800 + 2000 = 5000
    assert.equal(recordedParcelArea.isCompatible, true);
    assert.equal(recordedParcelArea.unit, 'SQ_M');
    assert.equal(recordedParcelArea.total, 5000);

    // Proposed affected areas: 500 + 750 + 850 = 2100
    assert.equal(proposedAffectedArea.isCompatible, true);
    assert.equal(proposedAffectedArea.unit, 'SQ_M');
    assert.equal(proposedAffectedArea.total, 2100);
  });

  it('18. Area aggregation: Incompatible units omit scalar sum and report unit breakdown', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${mixedUnitsCaseId}/verification-summary`,
      landOfficer1Cookie
    );
    const res = await verificationSummaryHandler(req, {
      params: Promise.resolve({ id: mixedUnitsCaseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const { recordedParcelArea, proposedAffectedArea } = json.data.areaTotals;

    // Mixed units: 1 parcel in SQ_M (1000) and 1 parcel in ACRE (2.5)
    assert.equal(recordedParcelArea.isCompatible, false, 'Mixed units must be marked incompatible');
    assert.equal(recordedParcelArea.total, null, 'Scalar sum must be null for mismatched units');
    assert.equal(recordedParcelArea.unit, null);
    assert.ok(recordedParcelArea.breakdownByUnit.SQ_M === 1000);
    assert.ok(recordedParcelArea.breakdownByUnit.ACRE === 2.5);

    // Proposed affected area: SQ_M (400) and ACRE (1.25)
    assert.equal(proposedAffectedArea.isCompatible, false);
    assert.equal(proposedAffectedArea.total, null);
    assert.ok(proposedAffectedArea.breakdownByUnit.SQ_M === 400);
    assert.ok(proposedAffectedArea.breakdownByUnit.ACRE === 1.25);
  });

  // --------------------------------------------------------------------------
  // Category 12: No automatic field-verification completion
  // --------------------------------------------------------------------------

  it('19. Case status remains AWAITING_FIELD_VERIFICATION (no automatic completion on report review)', async () => {
    const [c] = await db
      .select({ status: acquisitionCases.status })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, awaitingVerifCaseId))
      .limit(1);

    assert.equal(
      c.status,
      'AWAITING_FIELD_VERIFICATION',
      'Case status must remain in AWAITING_FIELD_VERIFICATION and not be automatically completed'
    );
  });

  // --------------------------------------------------------------------------
  // Category 13: Review queue API filtering and pagination
  // --------------------------------------------------------------------------

  it('20. Review queue: Excludes DRAFT reports and supports filtering by review status', async () => {
    // Query review queue with reviewStatus=ALL
    const reqAll = makeReq(
      'GET',
      `http://localhost:3000/api/field-verification-reviews?reviewStatus=ALL&page=1&limit=20`,
      landOfficer1Cookie
    );
    const resAll = await reviewQueueHandler(reqAll);
    if (resAll.status !== 200) {
      console.log('Test 20 Error:', resAll.status, await resAll.json());
    }
    assert.equal(resAll.status, 200);
    const jsonAll = await resAll.json();

    assert.ok(jsonAll.data.length > 0);
    for (const rpt of jsonAll.data) {
      assert.notEqual(rpt.status, 'DRAFT', 'Review queue must strictly exclude DRAFT reports');
    }

    // Query review queue for SUBMITTED reports only
    const reqSub = makeReq(
      'GET',
      `http://localhost:3000/api/field-verification-reviews?reviewStatus=SUBMITTED&page=1&limit=20`,
      landOfficer1Cookie
    );
    const resSub = await reviewQueueHandler(reqSub);
    assert.equal(resSub.status, 200);
    const jsonSub = await resSub.json();

    for (const rpt of jsonSub.data) {
      assert.equal(rpt.status, 'SUBMITTED', 'Must only return SUBMITTED reports awaiting review');
    }
  });
});
