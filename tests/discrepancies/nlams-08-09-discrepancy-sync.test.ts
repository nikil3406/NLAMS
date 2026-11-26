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
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

import {
  GET as caseParcelsGetHandler,
  POST as caseParcelsPostHandler,
} from '../../src/app/api/acquisition-cases/[id]/parcels/route';
import { GET as caseParcelDetailGetHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/route';
import { POST as parcelReportsPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/route';
import { POST as reportSubmitPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/submit/route';
import { POST as reportReviewPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/review/route';
import { POST as discrepancyPostHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/route';
import { POST as startInvPostHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/route';
import { POST as submitInvPostHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/[investigationId]/submit/route';
import { POST as resolveDiscrepancyPostHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/resolve/route';
import { fieldVerificationReportService } from '../../src/services/field-verification-reports';

function makeReq(method: string, url: string, cookie: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('NLAMS-08 & NLAMS-09 — Discrepancy Creation Restrictions and Parcel Flag Synchronization', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];

  let superAdminId: string;
  let fieldOfficerId: string;
  let fieldOfficerCookie: string;
  let landOfficerId: string;
  let landOfficerCookie: string;
  let unitIdKA: string;
  let nhaiAgencyId: string;
  let caseId: string;

  let parcelWithReportId: string;
  let parcelWithDiscrepanciesId: string;
  let parcelCleanId: string;

  let foReportId: string;
  let disc1Id: string;
  let disc2Id: string;
  let inv1Id: string;
  let inv2Id: string;

  before(async () => {
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super admin not found');
    superAdminId = sa.id;

    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    unitIdKA = ka.id;

    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    nhaiAgencyId = nhai.id;

    const [fieldRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);
    const [landRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const [fo] = await db.insert(users).values({
      name: `FO NLAMS0809 ${ts}`,
      email: `fo.nlams0809.${ts}@nlams.test`,
      passwordHash: pwdHash,
      status: 'ACTIVE',
    }).returning({ id: users.id });
    fieldOfficerId = fo.id;
    createdUserIds.push(fieldOfficerId);
    await db.insert(userRoles).values({ userId: fieldOfficerId, roleId: fieldRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: fieldOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    fieldOfficerCookie = `${authConfig.cookieName}=${(await sessionService.createSession(fieldOfficerId)).token}`;

    const [lo] = await db.insert(users).values({
      name: `LO NLAMS0809 ${ts}`,
      email: `lo.nlams0809.${ts}@nlams.test`,
      passwordHash: pwdHash,
      status: 'ACTIVE',
    }).returning({ id: users.id });
    landOfficerId = lo.id;
    createdUserIds.push(landOfficerId);
    await db.insert(userRoles).values({ userId: landOfficerId, roleId: landRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: landOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    landOfficerCookie = `${authConfig.cookieName}=${(await sessionService.createSession(landOfficerId)).token}`;

    const [proj] = await db.insert(projects).values({
      projectCode: `PRJ-0809-${ts}`,
      name: `NLAMS 08/09 Test Project ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      createdBy: superAdminId,
      status: 'ACCEPTED',
    }).returning({ id: projects.id });
    createdProjectIds.push(proj.id);

    const [c] = await db.insert(acquisitionCases).values({
      caseReference: `ACQ-0809-${ts}`,
      projectId: proj.id,
      title: `NLAMS 08/09 Test Case ${ts}`,
      status: 'AWAITING_FIELD_VERIFICATION',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    caseId = c.id;
    createdCaseIds.push(caseId);

    const createTestParcel = async (survey: string) => {
      const res = await caseParcelsPostHandler(
        makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels`, fieldOfficerCookie, {
          state: 'Karnataka',
          district: 'Bengaluru Urban',
          taluk: 'Yelahanka',
          village: 'Jakkur',
          surveyNumber: survey,
          totalArea: 4000,
          areaUnit: 'SQ_M',
          proposedAffectedArea: 1000,
          affectedAreaUnit: 'SQ_M',
        }),
        { params: Promise.resolve({ id: caseId }) }
      );
      assert.equal(res.status, 201);
      const json = await res.json();
      createdParcelIds.push(json.data.parcel.id);
      return json.data.id as string;
    };

    parcelWithReportId = await createTestParcel(`808A/${ts}`);
    parcelWithDiscrepanciesId = await createTestParcel(`808B/${ts}`);
    parcelCleanId = await createTestParcel(`808C/${ts}`);
  });

  after(async () => {
    try {
      if (createdCaseIds.length > 0) {
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

  it('NLAMS-08.1: Clean parcel without discrepancies allows Field Officer report creation directly', async () => {
    const rptRes = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelCleanId}/reports`, fieldOfficerCookie, {
        verificationDate: '2026-11-26T10:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Clean parcel verified directly',
        measuredArea: 1000,
        measuredAreaUnit: 'SQ_M',
        evidence: [{ evidenceType: 'PHOTO', fileReference: 'evid_clean_0809' }],
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelCleanId }) }
    );
    assert.equal(rptRes.status, 201);
  });

  it('NLAMS-08.2: Once ANY Field Officer report exists (DRAFT, SUBMITTED, RETURNED_FOR_CORRECTION, ACCEPTED), discrepancy creation is rejected (409)', async () => {
    // Create DRAFT report on parcelWithReportId
    const draftRes = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithReportId}/reports`, fieldOfficerCookie, {
        verificationDate: '2026-11-26T10:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Draft report blocks discrepancy creation',
        measuredArea: 1000,
        measuredAreaUnit: 'SQ_M',
        evidence: [{ evidenceType: 'PHOTO', fileReference: 'evid_draft_0809' }],
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithReportId }) }
    );
    assert.equal(draftRes.status, 201);
    foReportId = (await draftRes.json()).data.id;

    // 1) Rejected while DRAFT
    const dDraft = await discrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`, fieldOfficerCookie, {
        caseParcelId: parcelWithReportId,
        category: 'AREA_MISMATCH',
        description: 'Attempt while draft report exists',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(dDraft.status, 409);

    // 2) Submit -> Rejected while SUBMITTED
    const subRes = await reportSubmitPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithReportId}/reports/${foReportId}/submit`, fieldOfficerCookie),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithReportId, reportId: foReportId }) }
    );
    assert.equal(subRes.status, 200);

    const dSub = await discrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`, fieldOfficerCookie, {
        caseParcelId: parcelWithReportId,
        category: 'AREA_MISMATCH',
        description: 'Attempt while submitted report exists',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(dSub.status, 409);

    // 3) Return for correction -> Rejected while RETURNED_FOR_CORRECTION
    const retRes = await reportReviewPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithReportId}/reports/${foReportId}/review`, landOfficerCookie, {
        decision: 'RETURNED_FOR_CORRECTION',
        remarks: 'Needs clearer sketch',
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithReportId, reportId: foReportId }) }
    );
    assert.equal(retRes.status, 200);

    const dRet = await discrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`, fieldOfficerCookie, {
        caseParcelId: parcelWithReportId,
        category: 'AREA_MISMATCH',
        description: 'Attempt while returned report exists',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(dRet.status, 409);

    // Verify hasFieldReport is true on parcelWithReportId
    const detailRes = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithReportId}`, fieldOfficerCookie),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithReportId }) }
    );
    assert.equal((await detailRes.json()).data.hasFieldReport, true);
  });

  it('NLAMS-08.3 & NLAMS-09.1: Multiple discrepancies created on unreported parcel block report creation and keep discrepancy flag active', async () => {
    const d1Res = await discrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`, fieldOfficerCookie, {
        caseParcelId: parcelWithDiscrepanciesId,
        category: 'AREA_MISMATCH',
        description: 'Recorded area differs from ground survey',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(d1Res.status, 201);
    disc1Id = (await d1Res.json()).data.id;

    const d2Res = await discrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`, fieldOfficerCookie, {
        caseParcelId: parcelWithDiscrepanciesId,
        category: 'BOUNDARY_MISMATCH',
        description: 'Northern boundary fence shifted',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    const d2Json = await d2Res.json();
    assert.equal(d2Res.status, 201, `Expected 201, got ${d2Res.status}: ${JSON.stringify(d2Json)}`);
    disc2Id = d2Json.data.id;

    // Report creation must be blocked while discrepancies are OPEN
    const rptBlocked = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}/reports`, fieldOfficerCookie, {
        observations: 'Blocked by open discrepancies',
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    assert.equal(rptBlocked.status, 409);

    // Parcel flag must be active
    const detailRes = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}`, fieldOfficerCookie),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.hasUnresolvedDiscrepancy, true);
    assert.equal(detailJson.data.unresolvedDiscrepancyCount, 2);
  });

  it('NLAMS-08.4 & NLAMS-09.2: Investigation findings, further-investigation request, and partial closure keep flag active and report blocked', async () => {
    // Land Officer investigates both
    const inv1Start = await startInvPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc1Id}/investigations`, landOfficerCookie, {
        initialNotes: 'Starting area investigation',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc1Id }) }
    );
    assert.equal(inv1Start.status, 201);
    inv1Id = (await inv1Start.json()).data.investigation.id;

    const inv2Start = await startInvPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc2Id}/investigations`, landOfficerCookie, {
        initialNotes: 'Starting boundary investigation',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc2Id }) }
    );
    assert.equal(inv2Start.status, 201);
    inv2Id = (await inv2Start.json()).data.investigation.id;

    // Submit findings for disc1 -> SUBMITTED_FOR_RESOLUTION (not closed yet)
    const inv1Sub = await submitInvPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc1Id}/investigations/${inv1Id}/submit`, landOfficerCookie, {
        findings: 'Confirmed area measurement',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc1Id, investigationId: inv1Id }) }
    );
    assert.equal(inv1Sub.status, 200);

    // Still blocked while SUBMITTED_FOR_RESOLUTION
    const rptBlockedSub = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}/reports`, fieldOfficerCookie, {
        observations: 'Blocked while closure pending',
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    assert.equal(rptBlockedSub.status, 409);

    // Close disc1 -> disc2 is still UNDER_INVESTIGATION -> flag MUST remain active and report creation blocked
    const res1 = await resolveDiscrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc1Id}/resolve`, fieldOfficerCookie, {
        decision: 'RESOLVED',
        remarks: 'Area discrepancy resolved',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc1Id }) }
    );
    assert.equal(res1.status, 200);

    // Repeated closure attempt must fail (409)
    const dupClose = await resolveDiscrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc1Id}/resolve`, fieldOfficerCookie, {
        decision: 'RESOLVED',
        remarks: 'Duplicate closure attempt',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc1Id }) }
    );
    assert.equal(dupClose.status, 409);

    const detailAfterOne = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}`, fieldOfficerCookie),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    const jsonAfterOne = await detailAfterOne.json();
    assert.equal(jsonAfterOne.data.hasUnresolvedDiscrepancy, true);
    assert.equal(jsonAfterOne.data.unresolvedDiscrepancyCount, 1);

    const rptBlockedPartial = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}/reports`, fieldOfficerCookie, {
        observations: 'Blocked by second unresolved discrepancy',
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    assert.equal(rptBlockedPartial.status, 409);
  });

  it('NLAMS-08.5 & NLAMS-09.3: Closing the final discrepancy clears the parcel discrepancy flag and enables report creation', async () => {
    const inv2Sub = await submitInvPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc2Id}/investigations/${inv2Id}/submit`, landOfficerCookie, {
        findings: 'Confirmed boundary alignment',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc2Id, investigationId: inv2Id }) }
    );
    assert.equal(inv2Sub.status, 200);

    const res2 = await resolveDiscrepancyPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${disc2Id}/resolve`, fieldOfficerCookie, {
        decision: 'RESOLVED',
        remarks: 'Boundary discrepancy resolved',
      }),
      { params: Promise.resolve({ id: caseId, discrepancyId: disc2Id }) }
    );
    assert.equal(res2.status, 200);

    // Parcel discrepancy flag must now be cleared
    const detailCleared = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}`, fieldOfficerCookie),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    const jsonCleared = await detailCleared.json();
    assert.equal(jsonCleared.data.hasUnresolvedDiscrepancy, false);
    assert.equal(jsonCleared.data.unresolvedDiscrepancyCount, 0);

    // Case summary discrepancyFlaggedParcels must be 0
    const summary = await fieldVerificationReportService.getCaseVerificationSummary(caseId, landOfficerId);
    assert.equal(summary.discrepancyFlaggedParcels, 0);

    // Report creation must now succeed!
    const rptAllowed = await parcelReportsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${parcelWithDiscrepanciesId}/reports`, fieldOfficerCookie, {
        verificationDate: '2026-11-26T12:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Report created after all discrepancies resolved',
        measuredArea: 1000,
        measuredAreaUnit: 'SQ_M',
        evidence: [{ evidenceType: 'PHOTO', fileReference: 'evid_after_resolve_0809' }],
      }),
      { params: Promise.resolve({ id: caseId, caseParcelId: parcelWithDiscrepanciesId }) }
    );
    assert.equal(rptAllowed.status, 201);
  });
});
