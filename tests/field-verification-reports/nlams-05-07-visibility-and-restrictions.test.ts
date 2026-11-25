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
import { POST as reportCorrectPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/correct/route';

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

describe('NLAMS-05 & NLAMS-07 — Parcel Visibility and Subsequent Report Restrictions', () => {
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
  let mhLandOfficerId: string;
  let mhLandOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let nhaiAgencyId: string;
  let kaCaseId: string;
  let parcel1CaseParcelId: string;
  let parcel2CaseParcelId: string;
  let parcel1ReportId: string;
  let parcel2ReportId: string;

  before(async () => {
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super admin not found');
    superAdminId = sa.id;

    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitIdKA = ka.id;
    unitIdMH = mh.id;

    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    nhaiAgencyId = nhai.id;

    const [fieldRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);
    const [landRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const [fo] = await db.insert(users).values({
      name: `FO NLAMS0507 ${ts}`,
      email: `fo.nlams0507.${ts}@nlams.test`,
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
      name: `LO NLAMS0507 ${ts}`,
      email: `lo.nlams0507.${ts}@nlams.test`,
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

    const [mhLo] = await db.insert(users).values({
      name: `MH LO NLAMS0507 ${ts}`,
      email: `mh.lo.nlams0507.${ts}@nlams.test`,
      passwordHash: pwdHash,
      status: 'ACTIVE',
    }).returning({ id: users.id });
    mhLandOfficerId = mhLo.id;
    createdUserIds.push(mhLandOfficerId);
    await db.insert(userRoles).values({ userId: mhLandOfficerId, roleId: landRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: mhLandOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    mhLandOfficerCookie = `${authConfig.cookieName}=${(await sessionService.createSession(mhLandOfficerId)).token}`;

    const [proj] = await db.insert(projects).values({
      projectCode: `PRJ-0507-${ts}`,
      name: `NLAMS 05/07 Test Project ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      createdBy: superAdminId,
      status: 'ACCEPTED',
    }).returning({ id: projects.id });
    createdProjectIds.push(proj.id);

    const [c] = await db.insert(acquisitionCases).values({
      caseReference: `ACQ-0507-${ts}`,
      projectId: proj.id,
      title: `NLAMS 05/07 Test Case ${ts}`,
      status: 'AWAITING_FIELD_VERIFICATION',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    kaCaseId = c.id;
    createdCaseIds.push(kaCaseId);
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

  it('NLAMS-05.1: Field Officer creates a parcel without a report -> Field Officer sees it, Land Officer CANNOT see it', async () => {
    const createRes = await caseParcelsPostHandler(
      makeReq('POST', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels`, fieldOfficerCookie, {
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Yelahanka',
        village: 'Jakkur',
        surveyNumber: `505/${ts}`,
        totalArea: 5000,
        areaUnit: 'SQ_M',
        proposedAffectedArea: 1200,
        affectedAreaUnit: 'SQ_M',
      }),
      { params: Promise.resolve({ id: kaCaseId }) }
    );
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    parcel1CaseParcelId = created.data.id;
    createdParcelIds.push(created.data.parcel.id);

    // Field Officer sees it
    const foListRes = await caseParcelsGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels`, fieldOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId }) }
    );
    assert.equal(foListRes.status, 200);
    const foList = await foListRes.json();
    assert.equal(foList.pagination.total, 1);
    assert.equal(foList.data[0].id, parcel1CaseParcelId);

    // Land Officer CANNOT see it in list or search
    const loListRes = await caseParcelsGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels?search=Jakkur`, landOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId }) }
    );
    assert.equal(loListRes.status, 200);
    const loList = await loListRes.json();
    assert.equal(loList.pagination.total, 0, 'Unreported parcel must be excluded from Land Officer count');
    assert.equal(loList.data.length, 0, 'Unreported parcel must be excluded from Land Officer listing');

    // Land Officer CANNOT access it directly by ID (404)
    const loDetailRes = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}`, landOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
    );
    assert.equal(loDetailRes.status, 404, 'Land Officer must not access unreported parcel by direct ID');
  });

  it('NLAMS-05.2: Field Officer creates and saves report -> parcel becomes visible to Land Officer (respecting admin scope)', async () => {
    const rptRes = await parcelReportsPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports`,
        fieldOfficerCookie,
        {
          verificationDate: '2026-11-20T10:00:00.000Z',
          outcome: 'VERIFIED',
          observations: 'Initial inspection saved',
          measuredArea: 1200,
          measuredAreaUnit: 'SQ_M',
          evidence: [{ evidenceType: 'PHOTO', fileReference: 'evid_nlams05_1' }],
        }
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
    );
    assert.equal(rptRes.status, 201);
    parcel1ReportId = (await rptRes.json()).data.id;

    // Land Officer in KA now sees it
    const loListRes = await caseParcelsGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels`, landOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId }) }
    );
    assert.equal(loListRes.status, 200);
    const loList = await loListRes.json();
    assert.equal(loList.pagination.total, 1);
    assert.equal(loList.data[0].id, parcel1CaseParcelId);

    const loDetailRes = await caseParcelDetailGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}`, landOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
    );
    assert.equal(loDetailRes.status, 200);

    // Out-of-scope Land Officer (MH) still cannot see KA case parcels (404)
    const mhRes = await caseParcelsGetHandler(
      makeReq('GET', `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels`, mhLandOfficerCookie),
      { params: Promise.resolve({ id: kaCaseId }) }
    );
    assert.equal(mhRes.status, 404);
  });

  it('NLAMS-07.1: Previous report is DRAFT (pending) -> existing pending-report workflow preserved', async () => {
    // Field Officer submits the draft report
    const subRes = await reportSubmitPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports/${parcel1ReportId}/submit`,
        fieldOfficerCookie
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId, reportId: parcel1ReportId }) }
    );
    assert.equal(subRes.status, 200);
    assert.equal((await subRes.json()).data.status, 'SUBMITTED');
  });

  it('NLAMS-07.2: Previous report is SUBMITTED (under review) -> new report creation is blocked (409 Conflict)', async () => {
    const blockedRes = await parcelReportsPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports`,
        fieldOfficerCookie,
        {
          verificationDate: '2026-11-21T10:00:00.000Z',
          outcome: 'VERIFIED',
          observations: 'Duplicate report while under review',
        }
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
    );
    assert.equal(blockedRes.status, 409);
  });

  it('NLAMS-07.3: Simultaneous report creation requests when SUBMITTED cannot create duplicate reports', async () => {
    const [r1, r2] = await Promise.all([
      parcelReportsPostHandler(
        makeReq(
          'POST',
          `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports`,
          fieldOfficerCookie,
          { observations: 'Concurrent attempt 1' }
        ),
        { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
      ),
      parcelReportsPostHandler(
        makeReq(
          'POST',
          `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports`,
          fieldOfficerCookie,
          { observations: 'Concurrent attempt 2' }
        ),
        { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
      ),
    ]);
    assert.equal(r1.status, 409);
    assert.equal(r2.status, 409);
  });

  it('NLAMS-07.4: Previous report is RETURNED_FOR_CORRECTION -> correction workflow works and subsequent ACCEPTED blocks new reports', async () => {
    // Land Officer returns for correction
    const revRes = await reportReviewPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports/${parcel1ReportId}/review`,
        landOfficerCookie,
        { decision: 'RETURNED_FOR_CORRECTION', remarks: 'Clarify boundary photo' }
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId, reportId: parcel1ReportId }) }
    );
    assert.equal(revRes.status, 200);

    // Field Officer initiates correction draft (existing correction workflow)
    const corrRes = await reportCorrectPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports/${parcel1ReportId}/correct`,
        fieldOfficerCookie
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId, reportId: parcel1ReportId }) }
    );
    assert.equal(corrRes.status, 201);
    const corrReportId = (await corrRes.json()).data.id;

    // Submit corrected report
    const sub2Res = await reportSubmitPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports/${corrReportId}/submit`,
        fieldOfficerCookie
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId, reportId: corrReportId }) }
    );
    assert.equal(sub2Res.status, 200);

    // Land Officer accepts corrected report
    const accRes = await reportReviewPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports/${corrReportId}/review`,
        landOfficerCookie,
        { decision: 'ACCEPTED', remarks: 'Approved' }
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId, reportId: corrReportId }) }
    );
    assert.equal(accRes.status, 200);

    // Subsequent report creation is blocked (409 Conflict)
    const blockedAfterAcc = await parcelReportsPostHandler(
      makeReq(
        'POST',
        `http://localhost:3000/api/acquisition-cases/${kaCaseId}/parcels/${parcel1CaseParcelId}/reports`,
        fieldOfficerCookie,
        { observations: 'Attempt after acceptance' }
      ),
      { params: Promise.resolve({ id: kaCaseId, caseParcelId: parcel1CaseParcelId }) }
    );
    assert.equal(blockedAfterAcc.status, 409);

    // Verify existing report history remains intact (both rev 1 and rev 2 exist)
    const reportsInDb = await db
      .select({ id: fieldVerificationReports.id })
      .from(fieldVerificationReports)
      .where(eq(fieldVerificationReports.caseParcelId, parcel1CaseParcelId));
    assert.equal(reportsInDb.length, 2);
  });
});
