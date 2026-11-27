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
import { eq, inArray, sql } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';
import {
  GET as completionGetHandler,
  POST as completionPostHandler,
} from '../../src/app/api/acquisition-cases/[id]/verification-completion/route';

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

describe('NLAMS-10 — Required versus Verified Land-Area Validation', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];

  let superAdminId: string;
  let fieldOfficerId: string;
  let landOfficerId: string;
  let landOfficerCookie: string;
  let unitIdKA: string;
  let nhaiAgencyId: string;

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
      name: `FO NLAMS10 ${ts}`,
      email: `fo.nlams10.${ts}@nlams.test`,
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

    const [lo] = await db.insert(users).values({
      name: `LO NLAMS10 ${ts}`,
      email: `lo.nlams10.${ts}@nlams.test`,
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

  async function setupCaseWithBoundary(requiredArea: string, requiredUnit: string) {
    const [proj] = await db.insert(projects).values({
      projectCode: `PRJ-10-${Math.random().toString(36).slice(2, 8)}-${ts}`,
      name: `NLAMS-10 Project ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      createdBy: superAdminId,
      status: 'ACCEPTED',
    }).returning({ id: projects.id });
    createdProjectIds.push(proj.id);

    await db.execute(sql`
      INSERT INTO project_boundary_versions (
        project_id, version_number, geometry, estimated_land_area, estimated_area_unit, calculated_geometry_area, created_by
      ) VALUES (
        ${proj.id}::uuid,
        1,
        ST_GeomFromText('POLYGON((77.59 12.97, 77.60 12.97, 77.60 12.98, 77.59 12.98, 77.59 12.97))', 4326),
        ${requiredArea},
        ${requiredUnit},
        10000.00,
        ${superAdminId}::uuid
      )
    `);

    const [c] = await db.insert(acquisitionCases).values({
      caseReference: `ACQ-10-${Math.random().toString(36).slice(2, 8)}-${ts}`,
      projectId: proj.id,
      title: `NLAMS-10 Case ${ts}`,
      status: 'AWAITING_FIELD_VERIFICATION',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);
    return c.id;
  }

  async function addParcelWithAcceptedReport(
    caseId: string,
    totalArea: string,
    totalUnit: string,
    proposedArea: string,
    proposedUnit: string,
    measuredArea: string,
    measuredUnit: string,
    reportStatus: 'ACCEPTED' | 'SUBMITTED' | 'DRAFT' = 'ACCEPTED'
  ) {
    const [p] = await db.insert(landParcels).values({
      parcelId: `PRCL-10-${Math.random().toString(36).slice(2, 8)}-${ts}`,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Yelahanka',
      village: 'Jakkur',
      surveyNumber: `10-${Math.random().toString(36).slice(2, 6)}`,
      totalArea,
      areaUnit: totalUnit,
      createdBy: fieldOfficerId,
    }).returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db.insert(acquisitionCaseParcels).values({
      caseId,
      parcelId: p.id,
      proposedAffectedArea: proposedArea,
      affectedAreaUnit: proposedUnit,
      createdBy: fieldOfficerId,
    }).returning({ id: acquisitionCaseParcels.id });

    const [rpt] = await db.insert(fieldVerificationReports).values({
      caseParcelId: cp.id,
      verificationDate: new Date(),
      outcome: 'VERIFIED',
      observations: 'Measured area check',
      measuredArea,
      measuredAreaUnit: measuredUnit,
      status: reportStatus,
      createdBy: fieldOfficerId,
      ...(reportStatus !== 'DRAFT' ? { verifiedBy: fieldOfficerId, submittedAt: new Date() } : {}),
      ...(reportStatus === 'ACCEPTED'
        ? { reviewedBy: landOfficerId, reviewedAt: new Date(), reviewDecision: 'ACCEPTED', reviewRemarks: 'OK' }
        : {}),
    }).returning({ id: fieldVerificationReports.id });

    await db.insert(fieldVerificationEvidence).values({
      reportId: rpt.id,
      evidenceType: 'PHOTO',
      fileReference: `evid_${Math.random().toString(36).slice(2, 8)}`,
      createdBy: fieldOfficerId,
    });

    if (reportStatus === 'ACCEPTED') {
      await db.insert(fieldVerificationReportReviews).values({
        reportId: rpt.id,
        fromStatus: 'SUBMITTED',
        toStatus: 'ACCEPTED',
        decision: 'ACCEPTED',
        remarks: 'Verified',
        reviewerId: landOfficerId,
      });
    }
  }

  it('1. Insufficient verified area blocks completion (409) and returns mismatch details', async () => {
    const caseId = await setupCaseWithBoundary('10000.00', 'SQ_M');
    // Total recorded area is 15000 (must NOT be used!), verified area is 8000 (less than 10000)
    await addParcelWithAcceptedReport(caseId, '15000.0000', 'SQ_M', '9000.0000', 'SQ_M', '8000.0000', 'SQ_M', 'ACCEPTED');

    const getRes = await completionGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.data.isEligible, false);
    assert.equal(getJson.data.areaValidation.status, 'INSUFFICIENT');
    assert.equal(getJson.data.areaValidation.requiredAreaSqm, 10000);
    assert.equal(getJson.data.areaValidation.verifiedAreaSqm, 8000);
    assert.equal(getJson.data.areaValidation.differenceSqm, -2000);

    const postRes = await completionPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie, {}),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(postRes.status, 409);

    const [caseAfter] = await db.select({ status: acquisitionCases.status }).from(acquisitionCases).where(eq(acquisitionCases.id, caseId));
    assert.equal(caseAfter.status, 'AWAITING_FIELD_VERIFICATION');
  });

  it('2. Excessive verified area blocks completion (409)', async () => {
    const caseId = await setupCaseWithBoundary('5000.00', 'SQ_M');
    await addParcelWithAcceptedReport(caseId, '10000.0000', 'SQ_M', '5000.0000', 'SQ_M', '6000.0000', 'SQ_M', 'ACCEPTED');

    const postRes = await completionPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie, {}),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(postRes.status, 409);
    const json = await postRes.json();
    assert.match(json.error, /exceeds/i);
  });

  it('3. Unit normalization (HECTARE vs SQ_M + ACRE) & tolerance (0.01 SQ_M) allow completion when matched', async () => {
    // 1.00 HECTARE = 10,000 SQ_M
    const caseId = await setupCaseWithBoundary('1.00', 'HECTARE');
    // Parcel 1: 6000 SQ_M accepted, Parcel 2: 0.4000005 HECTARE (= 4000.005 SQ_M -> within 0.01 SQ_M tolerance!)
    await addParcelWithAcceptedReport(caseId, '8000.0000', 'SQ_M', '6000.0000', 'SQ_M', '6000.0000', 'SQ_M', 'ACCEPTED');
    await addParcelWithAcceptedReport(caseId, '5000.0000', 'SQ_M', '4000.0000', 'SQ_M', '0.4000', 'HECTARE', 'ACCEPTED');

    const getRes = await completionGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie),
      { params: Promise.resolve({ id: caseId }) }
    );
    const getJson = await getRes.json();
    assert.equal(getJson.data.areaValidation.isMatched, true);
    assert.equal(getJson.data.areaValidation.status, 'MATCHED');
    assert.equal(getJson.data.isEligible, true);

    const postRes = await completionPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie, {
        remarks: 'Verified area matches required area after unit normalization',
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(postRes.status, 200);
    const postJson = await postRes.json();
    assert.equal(postJson.data.status, 'FIELD_VERIFICATION_COMPLETED');
  });

  it('4. Differences outside tolerance (0.05 SQ_M > 0.01 SQ_M) block completion', async () => {
    const caseId = await setupCaseWithBoundary('1000.00', 'SQ_M');
    await addParcelWithAcceptedReport(caseId, '2000.0000', 'SQ_M', '1000.0000', 'SQ_M', '1000.0500', 'SQ_M', 'ACCEPTED');

    const postRes = await completionPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie, {}),
      { params: Promise.resolve({ id: caseId }) }
    );
    assert.equal(postRes.status, 409);
  });

  it('5. Unverified/pending parcels are excluded from verified aggregate', async () => {
    const caseId = await setupCaseWithBoundary('5000.00', 'SQ_M');
    // Parcel 1: 3000 ACCEPTED, Parcel 2: 2000 SUBMITTED (not accepted yet)
    await addParcelWithAcceptedReport(caseId, '5000.0000', 'SQ_M', '3000.0000', 'SQ_M', '3000.0000', 'SQ_M', 'ACCEPTED');
    await addParcelWithAcceptedReport(caseId, '5000.0000', 'SQ_M', '2000.0000', 'SQ_M', '2000.0000', 'SQ_M', 'SUBMITTED');

    const getRes = await completionGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, landOfficerCookie),
      { params: Promise.resolve({ id: caseId }) }
    );
    const getJson = await getRes.json();
    assert.equal(getJson.data.areaValidation.verifiedAreaSqm, 3000);
    assert.equal(getJson.data.areaValidation.isMatched, false);
    assert.equal(getJson.data.isEligible, false);
  });
});
