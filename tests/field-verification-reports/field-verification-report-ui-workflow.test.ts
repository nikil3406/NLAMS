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

import { db } from '../../db';
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

describe('NLAMS — Step 4: Field Verification Report UI & Workflow Integration', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];

  let superAdminId: string;
  let fieldOfficer1Id: string;
  let fieldOfficer1Cookie: string;
  let fieldOfficer2Id: string;
  let fieldOfficer2Cookie: string;
  let landOfficerId: string;
  let landOfficerCookie: string;

  let unitIdKA: string;
  let agencyId: string;
  let projectId: string;
  let awaitingVerifCaseId: string;
  let draftCaseId: string;
  let caseParcelId: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found.');
    superAdminId = sa.id;

    // 2. Resolve Administrative Unit (KA) & Agency
    const [ka] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    unitIdKA = ka.id;

    const [agency] = await db.select({ id: implementingAgencies.id }).from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 3. Resolve Roles
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);

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

    // Users
    fieldOfficer1Id = await makeUser('KA Field Officer Primary', 'fo.primary');
    await assignRole(fieldOfficer1Id, foRole.id);
    await assignUnit(fieldOfficer1Id, unitIdKA);
    fieldOfficer1Cookie = await makeSession(fieldOfficer1Id);

    fieldOfficer2Id = await makeUser('KA Field Officer Secondary', 'fo.secondary');
    await assignRole(fieldOfficer2Id, foRole.id);
    await assignUnit(fieldOfficer2Id, unitIdKA);
    fieldOfficer2Cookie = await makeSession(fieldOfficer2Id);

    landOfficerId = await makeUser('KA Land Officer UI', 'lo.reports.ui');
    await assignRole(landOfficerId, loRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // Create Project
    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-UI-FVR-${ts}`,
        name: `UI Field Report Project ${ts}`,
        projectType: 'HIGHWAY',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    projectId = proj.id;
    createdProjectIds.push(projectId);

    // Create Cases
    const [activeCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `NLAMS-CASE-UI-${ts}-AVF`,
        projectId,
        title: `Awaiting Field Verification Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    awaitingVerifCaseId = activeCase.id;
    createdCaseIds.push(activeCase.id);

    const [draftCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `NLAMS-CASE-UI-${ts}-DFT`,
        projectId,
        title: `Draft Case ${ts}`,
        status: 'DRAFT',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    draftCaseId = draftCase.id;
    createdCaseIds.push(draftCase.id);

    // Create Parcel
    const [parcel] = await db
      .insert(landParcels)
      .values({
        parcelId: `NLAMS-PRC-UI-${ts}-01`,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Marathahalli',
        surveyNumber: '202/B',
        totalArea: '8000.0000',
        areaUnit: 'SQ_M',
        createdBy: fieldOfficer1Id,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(parcel.id);

    // Associate Parcel with Awaiting Verification Case
    const [acp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: awaitingVerifCaseId,
        parcelId: parcel.id,
        proposedAffectedArea: '3500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: fieldOfficer1Id,
      })
      .returning({ id: acquisitionCaseParcels.id });
    caseParcelId = acp.id;
    createdCaseParcelIds.push(acp.id);
  });

  after(async () => {
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

  it('1. Initial state: Parcel has 0 reports and returns empty list with pagination metadata', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie
    );
    const res = await parcelReportsGetHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 0);
    assert.equal(json.pagination.total, 0);
  });

  let reportId: string;

  it('2. Field Officer creates draft report with inspection details, measurements, and initial evidence', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-27T14:30:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Cadastral stone pillars identified on north-west boundary.',
        measuredArea: 3490.5,
        measuredAreaUnit: 'SQ_M',
        measurementMethod: 'Total Station Survey',
        measurementNotes: 'Benchmark BM-10 used for triangulation.',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: 'evid_photo_bm10_01',
            caption: 'North-west boundary stone marker',
            description: 'Geo-tagged photograph with 5m positional accuracy',
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
    assert.equal(json.data.outcome, 'VERIFIED');
    assert.equal(json.data.createdBy, fieldOfficer1Id);
    assert.equal(json.data.evidence.length, 1);
    reportId = json.data.id;
    createdReportIds.push(reportId);
  });

  it('3. Parcel reports section updates dynamically and displays report metadata', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie
    );
    const res = await parcelReportsGetHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.length, 1);
    const rpt = json.data[0];
    assert.equal(rpt.id, reportId);
    assert.equal(rpt.status, 'DRAFT');
    assert.equal(rpt.outcome, 'VERIFIED');
    assert.equal(rpt.creator.id, fieldOfficer1Id);
    assert.equal(rpt.evidence.length, 1);
  });

  it('4. Author updates draft report via PATCH and changes persist', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}`,
      fieldOfficer1Cookie,
      {
        observations: 'Updated observations: Boundary encroachment noted on eastern parcel corner.',
        outcome: 'DISCREPANCY_FOUND',
      }
    );
    const res = await reportDetailPatchHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.outcome, 'DISCREPANCY_FOUND');
    assert.match(json.data.observations, /encroachment/i);
    assert.equal(json.data.status, 'DRAFT');
  });

  it('5. Author isolation: Another Field Officer cannot edit the draft report (403 Forbidden)', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}`,
      fieldOfficer2Cookie,
      {
        observations: 'Unauthorized field officer modifying report',
      }
    );
    const res = await reportDetailPatchHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /only the author/i);
  });

  it('6. Evidence endpoint attaches additional evidence reference to draft report', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'SKETCH',
        fileReference: 'evid_sketch_encroachment_02',
        caption: 'Encroachment overlay sketch',
        description: 'Encroachment diagram aligned with cadastral village sheet',
      }
    );
    const res = await reportEvidencePostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.reportId, reportId);
    assert.equal(json.data.evidenceType, 'SKETCH');

    // Retrieve evidence list
    const getEvReq = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/evidence`,
      fieldOfficer1Cookie
    );
    const getEvRes = await reportEvidenceGetHandler(getEvReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(getEvRes.status, 200);
    const getEvJson = await getEvRes.json();
    assert.equal(getEvJson.data.length, 2);
  });

  it('7. Rejects external URLs and file paths in evidence references (400 Bad Request)', async () => {
    const reqUrl = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'PHOTO',
        fileReference: 'http://insecure-host.com/photo.png',
      }
    );
    const resUrl = await reportEvidencePostHandler(reqUrl, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(resUrl.status, 400);

    const reqPath = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/evidence`,
      fieldOfficer1Cookie,
      {
        evidenceType: 'PHOTO',
        fileReference: 'D:\\documents\\survey.pdf',
      }
    );
    const resPath = await reportEvidencePostHandler(reqPath, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(resPath.status, 400);
  });

  it('8. Field Officer successfully submits report: Transitions to SUBMITTED and locks', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/submit`,
      fieldOfficer1Cookie,
      { remarks: 'Submitted for Land Officer review' }
    );
    const res = await reportSubmitPostHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'SUBMITTED');
    assert.equal(json.data.verifiedBy, fieldOfficer1Id);
    assert.ok(json.data.submittedAt);
  });

  it('9. Submitted report is immutable: Editing or re-submitting returns 409 Conflict', async () => {
    const editReq = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}`,
      fieldOfficer1Cookie,
      { observations: 'Altering locked report' }
    );
    const editRes = await reportDetailPatchHandler(editReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(editRes.status, 409);

    const subReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports/${reportId}/submit`,
      fieldOfficer1Cookie
    );
    const subRes = await reportSubmitPostHandler(subReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId, reportId }),
    });
    assert.equal(subRes.status, 409);
  });

  it('10. Multiple reports: Follow-up inspection creates a second separate report for the same parcel', async () => {
    const followUpReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}/reports`,
      fieldOfficer1Cookie,
      {
        verificationDate: '2026-10-28T10:00:00.000Z',
        outcome: 'VERIFIED',
        observations: 'Follow-up joint inspection with revenue inspector. Encroachment cleared.',
        measuredArea: 3500.0,
        measuredAreaUnit: 'SQ_M',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: 'evid_followup_clearance_photo_03',
            caption: 'Demarcated boundary post clearance',
          },
        ],
      }
    );
    const followUpRes = await parcelReportsPostHandler(followUpReq, {
      params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }),
    });
    assert.equal(followUpRes.status, 201);
    const followUpJson = await followUpRes.json();
    const followUpId = followUpJson.data.id;
    createdReportIds.push(followUpId);

    // List reports: now returns 2 reports in stable order (latest first)
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
    assert.equal(listJson.data.length, 2);
    assert.equal(listJson.data[0].id, followUpId);
    assert.equal(listJson.data[1].id, reportId);
  });

  it('11. Acquisition case status remains AWAITING_FIELD_VERIFICATION (no automatic completion)', async () => {
    const [c] = await db
      .select({ status: acquisitionCases.status })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, awaitingVerifCaseId))
      .limit(1);
    assert.equal(
      c.status,
      'AWAITING_FIELD_VERIFICATION',
      'Case status must remain in AWAITING_FIELD_VERIFICATION'
    );
  });

  it('12. Case-level reports listing displays reports across parcels in the case with pagination', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/reports?page=1&limit=10`,
      landOfficerCookie
    );
    const res = await caseReportsGetHandler(req, {
      params: Promise.resolve({ id: awaitingVerifCaseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.data.length >= 2);
    assert.equal(json.pagination.page, 1);
    assert.ok(json.pagination.total >= 2);
  });
});
