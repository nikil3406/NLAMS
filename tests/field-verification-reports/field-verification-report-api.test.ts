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
import { fieldVerificationReports } from '../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../db/schema/field-verification-evidence';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import {
  GET as parcelReportsGetHandler,
  POST as parcelReportsPostHandler,
} from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/route';
import {
  GET as reportDetailGetHandler,
  PATCH as reportDetailPatchHandler,
} from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/route';
import {
  POST as reportSubmitPostHandler,
} from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/submit/route';
import {
  GET as reportEvidenceGetHandler,
  POST as reportEvidencePostHandler,
} from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/evidence/route';
import {
  GET as caseReportsGetHandler,
} from '../../src/app/api/acquisition-cases/[id]/reports/route';

describe('NLAMS — Step 4: Field Verification Report Backend', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  // KA Field Officers
  let fieldOfficer1Id: string;
  let fieldOfficer1Cookie: string;

  let fieldOfficer2Id: string;
  let fieldOfficer2Cookie: string;

  // KA Land Officer (lacks FIELD_OFFICER role)
  let landOfficerId: string;
  let landOfficerCookie: string;

  // MH Field Officer (out-of-scope for KA case)
  let mhFieldOfficerId: string;
  let mhFieldOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  // Acquisition Cases
  let draftCaseId: string;
  let awaitingVerifCaseId: string;
  let mhAwaitingVerifCaseId: string;

  // Parcels and associations
  let caseParcelId: string;
  let mhCaseParcelId: string;

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

    // 3. Resolve Agency
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

    // Sessions
    superAdminCookie = await makeSession(superAdminId);

    // Field Officer 1 (author)
    fieldOfficer1Id = await makeUser('KA Field Officer 1', 'fo1.reports');
    await assignRole(fieldOfficer1Id, foRole.id);
    await assignUnit(fieldOfficer1Id, unitIdKA);
    fieldOfficer1Cookie = await makeSession(fieldOfficer1Id);

    // Field Officer 2 (distinct user in same KA scope)
    fieldOfficer2Id = await makeUser('KA Field Officer 2', 'fo2.reports');
    await assignRole(fieldOfficer2Id, foRole.id);
    await assignUnit(fieldOfficer2Id, unitIdKA);
    fieldOfficer2Cookie = await makeSession(fieldOfficer2Id);

    // Land Officer (KA)
    landOfficerId = await makeUser('KA Land Officer', 'lo.reports');
    await assignRole(landOfficerId, loRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // MH Field Officer (different scope)
    mhFieldOfficerId = await makeUser('MH Field Officer', 'mh.fo.reports');
    await assignRole(mhFieldOfficerId, foRole.id);
    await assignUnit(mhFieldOfficerId, unitIdMH);
    mhFieldOfficerCookie = await makeSession(mhFieldOfficerId);

    // Create Projects
    const [kaProj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-FVR-KA-${ts}`,
        name: `Test Project KA ${ts}`,
        projectType: 'HIGHWAY',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    createdProjectIds.push(kaProj.id);

    const [mhProj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-FVR-MH-${ts}`,
        name: `Test Project MH ${ts}`,
        projectType: 'RAILWAY',
        status: 'REGISTERED',
        administrativeUnitId: unitIdMH,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    createdProjectIds.push(mhProj.id);

    // Create Cases
    const [draftCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `NLAMS-CASE-${ts}-DFT`,
        projectId: kaProj.id,
        title: `Draft Case ${ts}`,
        status: 'DRAFT',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(draftCase.id);
    draftCaseId = draftCase.id;

    const [activeCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `NLAMS-CASE-${ts}-AVF`,
        projectId: kaProj.id,
        title: `Awaiting Verif Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(activeCase.id);
    awaitingVerifCaseId = activeCase.id;

    const [mhCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `NLAMS-CASE-${ts}-MH`,
        projectId: mhProj.id,
        title: `MH Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: superAdminId,
        updatedBy: superAdminId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(mhCase.id);
    mhAwaitingVerifCaseId = mhCase.id;

    // Create Land Parcels
    const [parcel1] = await db
      .insert(landParcels)
      .values({
        parcelId: `NLAMS-PRC-TEST-${ts}-1`,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Bellandur',
        surveyNumber: '101/A',
        totalArea: '10000.0000',
        areaUnit: 'SQ_M',
        createdBy: fieldOfficer1Id,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(parcel1.id);

    const [mhParcel] = await db
      .insert(landParcels)
      .values({
        parcelId: `NLAMS-PRC-TEST-${ts}-MH`,
        state: 'Maharashtra',
        district: 'Pune',
        taluk: 'Haveli',
        village: 'Kothrud',
        surveyNumber: '55/B',
        totalArea: '5000.0000',
        areaUnit: 'SQ_M',
        createdBy: mhFieldOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(mhParcel.id);

    // Associate Parcels with Cases
    const [acp1] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: awaitingVerifCaseId,
        parcelId: parcel1.id,
        proposedAffectedArea: '4500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: fieldOfficer1Id,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(acp1.id);
    caseParcelId = acp1.id;

    const [mhAcp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: mhAwaitingVerifCaseId,
        parcelId: mhParcel.id,
        proposedAffectedArea: '2000.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: mhFieldOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(mhAcp.id);
    mhCaseParcelId = mhAcp.id;
  });

  after(async () => {
    // Cleanup in reverse dependency order
    if (createdReportIds.length > 0) {
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
  });

  const makeReq = (method: string, url: string, cookie?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  it('1. Unauthenticated requests are rejected with 401', async () => {
    const postReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      undefined,
      { observations: 'Draft observations' }
    );
    const postRes = await parcelReportsPostHandler(postReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(postRes.status, 401);

    const getReq = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`
    );
    const getRes = await parcelReportsGetHandler(getReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(getRes.status, 401);
  });

  it('2. Incorrect role (e.g. LAND_OFFICER) cannot create reports (403 Forbidden)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      landOfficerCookie,
      { observations: 'Land Officer trying to create report' }
    );
    const res = await parcelReportsPostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /Field Officer/i);
  });

  it('3. Out-of-scope field officer (MH) cannot create report on KA case (403 or 404)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      mhFieldOfficerCookie,
      { observations: 'Cross-scope field report attempt' }
    );
    const res = await parcelReportsPostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.ok(res.status === 403 || res.status === 404);
  });

  it('4. Cannot create a report against an inactive case (status DRAFT) (400 Bad Request)', async () => {
    // Link parcel to draft case
    const [dAcp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: draftCaseId,
        parcelId: createdParcelIds[0],
        proposedAffectedArea: '100.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: fieldOfficer1Id,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(dAcp.id);

    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${draftCaseId}/parcels/${dAcp.id}/reports`,
      fieldOfficer1Cookie,
      { observations: 'Report on draft case' }
    );
    const res = await parcelReportsPostHandler(req, {
      params: Promise.resolve({ id: draftCaseId, caseParcelId: dAcp.id }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /AWAITING_FIELD_VERIFICATION/i);
  });

  it('5. Super Admin cannot bypass separation-of-duties role requirement (403 Forbidden)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      superAdminCookie,
      { observations: 'Super Admin creating report directly' }
    );
    const res = await parcelReportsPostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(res.status, 403, 'Super Admin lacking FIELD_OFFICER role must be rejected');
  });

  let report1Id: string;

  it('6. Authorized Field Officer creates draft report successfully (201 Created)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-27T10:30:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Initial boundary inspection. Pillars located.',
        measuredArea: 4480.5,
        measuredAreaUnit: 'SQ_M',
        measurementMethod: 'DGPS Survey',
        measurementNotes: 'Differential GPS survey completed with 10mm accuracy.',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: 'evid_photo_boundary_01',
            caption: 'North-East boundary pillar',
          },
        ],
      }
    );
    const res = await parcelReportsPostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'DRAFT');
    assert.equal(json.data.createdBy, fieldOfficer1Id);
    assert.equal(json.data.caseParcelId, caseParcelId);
    assert.equal(json.data.outcome, 'VERIFIED');
    assert.equal(json.data.evidence.length, 1);
    assert.equal(json.data.evidence[0].fileReference, 'evid_photo_boundary_01');

    report1Id = json.data.id;
    createdReportIds.push(report1Id);
  });

  it('7. Retrieves report by ID with joined parcel and case references (200 OK)', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer1Cookie
    );
    const res = await reportDetailGetHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.id, report1Id);
    assert.equal(json.data.case.id, awaitingVerifCaseId);
    assert.equal(json.data.caseParcel.id, caseParcelId);
    assert.equal(json.data.parcel.surveyNumber, '101/A');
    assert.equal(json.data.creator.id, fieldOfficer1Id);
  });

  it('8. Possession of report ID does not grant access across different parcel or case (404 Not Found)', async () => {
    // Attempting to access report1Id under MH case or parcel
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${mhAwaitingVerifCaseId}/parcels/${mhCaseParcelId}/reports/${report1Id}`,
      superAdminCookie
    );
    const res = await reportDetailGetHandler(req, {
      params: Promise.resolve({ id: mhAwaitingVerifCaseId, caseParcelId: mhCaseParcelId, reportId: report1Id }),
    });
    assert.equal(res.status, 404, 'Mismatched case/parcel association must yield 404 Not Found');
  });

  it('9. Author updates draft report successfully via PATCH (200 OK)', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer1Cookie,
      {
        observations: 'Updated observations: Boundary encroached on southern corner.',
        outcome: 'DISCREPANCY_FOUND',
      }
    );
    const res = await reportDetailPatchHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.outcome, 'DISCREPANCY_FOUND');
    assert.match(json.data.observations, /encroached/i);
  });

  it('10. Different user (Field Officer 2) cannot edit draft report (403 Forbidden)', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer2Cookie,
      {
        observations: 'Field Officer 2 tampering with draft',
      }
    );
    const res = await reportDetailPatchHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /only the author/i);
  });

  it('11. Attaches additional evidence to draft report via dedicated endpoint (201 Created)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'SKETCH',
        fileReference: 'evid_sketch_boundary_discrepancy_02',
        caption: 'Cadastral overlay sketch showing encroachment',
        description: 'Encroachment of 20 sqm observed against village revenue map',
      }
    );
    const res = await reportEvidencePostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.reportId, report1Id);
    assert.equal(json.data.evidenceType, 'SKETCH');

    // List evidence
    const listReq = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/evidence`,
      fieldOfficer1Cookie
    );
    const listRes = await reportEvidenceGetHandler(listReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.data.length, 2);
  });

  it('12. Rejects arbitrary URLs or raw file paths as evidence references (400 Bad Request)', async () => {
    const reqUrl = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'PHOTO',
        fileReference: 'https://malicious-external-site.com/fake-evidence.jpg',
      }
    );
    const resUrl = await reportEvidencePostHandler(reqUrl, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(resUrl.status, 400);

    const reqPath = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'PHOTO',
        fileReference: 'C:\\Users\\admin\\secret.jpg',
      }
    );
    const resPath = await reportEvidencePostHandler(reqPath, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(resPath.status, 400);
  });

  it('13. Validation: Measured area must be positive and require a unit (400 Bad Request)', async () => {
    const reqNeg = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer1Cookie,
      {
        measuredArea: -50,
        measuredAreaUnit: 'SQ_M',
      }
    );
    const resNeg = await reportDetailPatchHandler(reqNeg, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(resNeg.status, 400);

    const reqNoUnit = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer1Cookie,
      {
        measuredArea: 500,
        measuredAreaUnit: null,
      }
    );
    const resNoUnit = await reportDetailPatchHandler(reqNoUnit, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(resNoUnit.status, 400);
  });

  it('14. Cannot submit a report without evidence items (400 Bad Request)', async () => {
    // Create an empty draft report without evidence
    const createReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-27T11:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Inspection without evidence attached yet',
      }
    );
    const createRes = await parcelReportsPostHandler(createReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    const noEvidenceReportId = createJson.data.id;
    createdReportIds.push(noEvidenceReportId);

    // Attempt submission without evidence
    const submitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${noEvidenceReportId}/submit`,
      fieldOfficer1Cookie
    );
    const submitRes = await reportSubmitPostHandler(submitReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: noEvidenceReportId }),
    });
    assert.equal(submitRes.status, 400);
    const submitJson = await submitRes.json();
    assert.match(submitJson.error, /evidence item/i);
  });

  it('15. Cannot submit a report with empty observations (400 Bad Request)', async () => {
    // Create draft with evidence but empty observations
    const createReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-27T11:00:00.000Z',
        outcome: 'VERIFIED',
        observations: '   ',
        evidence: [
          { evidenceType: 'PHOTO', fileReference: 'evid_valid_01' },
        ],
      }
    );
    const createRes = await parcelReportsPostHandler(createReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    const blankObsReportId = createJson.data.id;
    createdReportIds.push(blankObsReportId);

    const submitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${blankObsReportId}/submit`,
      fieldOfficer1Cookie
    );
    const submitRes = await reportSubmitPostHandler(submitReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: blankObsReportId }),
    });
    assert.equal(submitRes.status, 400);
    const submitJson = await submitRes.json();
    assert.match(submitJson.error, /observations cannot be empty/i);
  });

  it('16. Successful submission with valid evidence transitions to SUBMITTED (200 OK)', async () => {
    const submitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/submit`,
      fieldOfficer1Cookie,
      { remarks: 'Ready for Land Officer review' }
    );
    const submitRes = await reportSubmitPostHandler(submitReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(submitRes.status, 200);
    const submitJson = await submitRes.json();
    assert.equal(submitJson.data.status, 'SUBMITTED');
    assert.equal(submitJson.data.verifiedBy, fieldOfficer1Id);
    assert.ok(submitJson.data.submittedAt, 'submittedAt timestamp must be recorded');
  });

  it('17. No automatic case completion: Acquisition case remains in AWAITING_FIELD_VERIFICATION', async () => {
    const [c] = await db
      .select({ status: acquisitionCases.status })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, awaitingVerifCaseId))
      .limit(1);
    assert.equal(
      c.status,
      'AWAITING_FIELD_VERIFICATION',
      'Case status must remain in AWAITING_FIELD_VERIFICATION; report submission is not case approval'
    );
  });

  it('18. Submitted report cannot be modified or re-submitted (409 Conflict)', async () => {
    // Attempt to update submitted report
    const patchReq = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}`,
      fieldOfficer1Cookie,
      { observations: 'Attempting to change submitted report' }
    );
    const patchRes = await reportDetailPatchHandler(patchReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(patchRes.status, 409);

    // Attempt repeated / duplicate submission
    const resubmitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${report1Id}/submit`,
      fieldOfficer1Cookie
    );
    const resubmitRes = await reportSubmitPostHandler(resubmitReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId: report1Id }),
    });
    assert.equal(resubmitRes.status, 409);
  });

  it('19. Follow-up inspection creates a separate report for the same parcel (supports multiple reports)', async () => {
    const followUpReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-28T09:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Follow-up re-inspection following discrepancy resolution on southern boundary.',
        measuredArea: 4495.0,
        measuredAreaUnit: 'SQ_M',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: 'evid_followup_pillar_resolved_03',
            caption: 'Resolved boundary demarcation',
          },
        ],
      }
    );
    const followUpRes = await parcelReportsPostHandler(followUpReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(followUpRes.status, 201);
    const followUpJson = await followUpRes.json();
    assert.notEqual(followUpJson.data.id, report1Id);
    createdReportIds.push(followUpJson.data.id);

    // List reports for this parcel association: should return at least 2 reports
    const listReq = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie
    );
    const listRes = await parcelReportsGetHandler(listReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.length >= 2, 'Parcel association must support multiple inspection reports over time');

    // Deterministic ordering: latest inspection date first
    assert.equal(listJson.data[0].id, followUpJson.data.id);
  });

  it('20. Case-level report listing retrieves all reports for the case with pagination (200 OK)', async () => {
    const caseReq = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/reports?page=1&limit=10`,
      landOfficerCookie
    );
    const caseRes = await caseReportsGetHandler(caseReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId }),
    });
    assert.equal(caseRes.status, 200);
    const caseJson = await caseRes.json();
    assert.ok(caseJson.data.length >= 2);
    assert.equal(caseJson.pagination.page, 1);
    assert.ok(caseJson.pagination.total >= 2);
  });

  it('21. Client-supplied audit fields, status, or IDs in request body are ignored / not trusted', async () => {
    const forgedReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        id: '00000000-0000-0000-0000-000000000001',
        status: 'SUBMITTED',
        verifiedBy: superAdminId,
        createdBy: superAdminId,
        submittedAt: '2020-01-01T00:00:00.000Z',
        observations: 'Forging audit parameters in request',
      }
    );
    const forgedRes = await parcelReportsPostHandler(forgedReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(forgedRes.status, 201);
    const forgedJson = await forgedRes.json();
    assert.notEqual(forgedJson.data.id, '00000000-0000-0000-0000-000000000001');
    assert.equal(forgedJson.data.status, 'DRAFT', 'Server must always enforce initial DRAFT status');
    assert.equal(forgedJson.data.createdBy, fieldOfficer1Id, 'CreatedBy must be authenticated user');
    assert.equal(forgedJson.data.verifiedBy, null, 'Draft cannot have verifiedBy set');
    assert.equal(forgedJson.data.submittedAt, null, 'Draft cannot have submittedAt set');
    createdReportIds.push(forgedJson.data.id);
  });
});
