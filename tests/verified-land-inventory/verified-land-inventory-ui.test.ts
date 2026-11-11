import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema/users';
import { roles } from '../../db/schema/roles';
import { userRoles } from '../../db/schema/user-roles';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { userAssignments } from '../../db/schema/user-assignments';
import { projects } from '../../db/schema/projects';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../db/schema/field-verification-evidence';
import { fieldVerificationReportReviews } from '../../db/schema/field-verification-report-reviews';
import { parcelDiscrepancies } from '../../db/schema/parcel-discrepancies';
import { discrepancyResolutionHistory } from '../../db/schema/discrepancy-resolution-history';
import { verifiedLandInventories } from '../../db/schema/verified-land-inventories';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';
import {
  POST as generateInventoryHandler,
  GET as listVersionsHandler,
} from '../../src/app/api/acquisition-cases/[id]/inventories/route';
import { GET as getInventoryHandler } from '../../src/app/api/verified-land-inventories/[id]/route';
import { POST as submitInventoryHandler } from '../../src/app/api/verified-land-inventories/[id]/submit/route';
import { POST as reviewDecisionHandler } from '../../src/app/api/verified-land-inventories/[id]/decision/route';
import { GET as getDashboardHandler } from '../../src/app/api/verified-land-inventories/dashboard/route';
import { GET as listAcquisitionCasesHandler } from '../../src/app/api/acquisition-cases/route';

describe('NLAMS — Verified Land Inventory Management UI & Integration', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let fieldOfficerId: string;

  let unitIdKA: string;
  let agencyId: string;
  let projectId: string;
  let eligibleCaseId: string;
  let ineligibleCaseId: string;
  let parcel1Id: string;
  let parcel2Id: string;
  let caseParcel1Id: string;
  let caseParcel2Id: string;
  let report1Id: string;
  let report2Id: string;
  let discrepancyId: string;

  const createdCaseIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdDiscrepancyIds: string[] = [];

  const makeReq = (
    method: 'GET' | 'POST',
    url: string,
    cookie?: string,
    body?: unknown
  ) => {
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  before(async () => {
    // 1. Resolve Super Admin
    const [saRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'SUPER_ADMIN'))
      .limit(1);
    const [saUser] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, saRole.id))
      .limit(1);
    superAdminId = saUser.id;

    // 2. Resolve Admin Units
    const [ka] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    unitIdKA = ka.id;

    // 3. Resolve Agency
    const [agency] = await db.select().from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 4. Resolve Roles
    const [loRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'LAND_OFFICER'))
      .limit(1);
    const [maRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'MINISTRY_ADMIN'))
      .limit(1);
    const [foRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'FIELD_OFFICER'))
      .limit(1);

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

    const makeSession = async (userId: string) => {
      const { token } = await sessionService.createSession(userId);
      return `${authConfig.cookieName}=${token}`;
    };

    superAdminCookie = await makeSession(superAdminId);

    // Land Officer
    landOfficerId = await makeUser('UI KA Land Officer', 'ui.ka.lo');
    await db.insert(userRoles).values({
      userId: landOfficerId,
      roleId: loRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: landOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    landOfficerCookie = await makeSession(landOfficerId);

    // Ministry Admin
    ministryAdminId = await makeUser('UI KA Ministry Admin', 'ui.ka.ma');
    await db.insert(userRoles).values({
      userId: ministryAdminId,
      roleId: maRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: ministryAdminId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    ministryAdminCookie = await makeSession(ministryAdminId);

    // Field Officer
    fieldOfficerId = await makeUser('UI KA Field Officer', 'ui.ka.fo');
    await db.insert(userRoles).values({
      userId: fieldOfficerId,
      roleId: foRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: fieldOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });

    // Create Base Project
    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-UI-${ts}`,
        name: `UI Verified Inventory Project ${ts}`,
        projectType: 'HIGHWAY',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    projectId = proj.id;
    createdProjectIds.push(projectId);

    // Setup an Eligible Case in FIELD_VERIFICATION_COMPLETED
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-UI-${ts}`,
        projectId,
        title: `UI Verified Acquisition Case ${ts}`,
        description: 'Case with verified parcels and resolved discrepancies for UI test',
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    eligibleCaseId = c.id;
    createdCaseIds.push(eligibleCaseId);

    // Setup an Ineligible Case in AWAITING_FIELD_VERIFICATION
    const [inCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-INELIG-${ts}`,
        projectId,
        title: `Ineligible Case ${ts}`,
        description: 'Field verification not yet completed',
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    ineligibleCaseId = inCase.id;
    createdCaseIds.push(ineligibleCaseId);

    // Parcel 1: 1000 SQ_M, affected 600 SQ_M
    const [p1] = await db
      .insert(landParcels)
      .values({
        parcelId: `P1-UI-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-201-${ts}`,
        subdivisionNumber: '1A',
        landRecordReference: `RTC-201-${ts}`,
        totalArea: '1000.0000',
        areaUnit: 'SQ_M',
        landUse: 'AGRICULTURAL',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    parcel1Id = p1.id;
    createdParcelIds.push(parcel1Id);

    const [cp1] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: eligibleCaseId,
        parcelId: parcel1Id,
        proposedAffectedArea: '600.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    caseParcel1Id = cp1.id;
    createdCaseParcelIds.push(caseParcel1Id);

    // Parcel 2: 2500 SQ_M, affected 1400 SQ_M
    const [p2] = await db
      .insert(landParcels)
      .values({
        parcelId: `P2-UI-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-202-${ts}`,
        subdivisionNumber: '2B',
        landRecordReference: `RTC-202-${ts}`,
        totalArea: '2500.0000',
        areaUnit: 'SQ_M',
        landUse: 'COMMERCIAL',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    parcel2Id = p2.id;
    createdParcelIds.push(parcel2Id);

    const [cp2] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: eligibleCaseId,
        parcelId: parcel2Id,
        proposedAffectedArea: '1400.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    caseParcel2Id = cp2.id;
    createdCaseParcelIds.push(caseParcel2Id);

    // Reports for Parcel 1 (ACCEPTED, verified, evidence, audit)
    const [r1] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: caseParcel1Id,
        verifiedBy: fieldOfficerId,
        verificationDate: new Date('2026-03-01T10:00:00Z'),
        outcome: 'VERIFIED',
        observations: 'All boundaries clear and verified',
        measuredArea: '595.0000',
        measuredAreaUnit: 'SQ_M',
        status: 'ACCEPTED',
        submittedAt: new Date('2026-03-02T10:00:00Z'),
        reviewedBy: landOfficerId,
        reviewedAt: new Date('2026-03-03T10:00:00Z'),
        reviewDecision: 'ACCEPTED',
        reviewRemarks: 'Verified and accepted',
        revisionNumber: 1,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    report1Id = r1.id;
    createdReportIds.push(report1Id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: report1Id,
      evidenceType: 'PHOTO',
      fileReference: `evidence-p1-${ts}.jpg`,
      caption: 'p1 site photo',
      createdBy: fieldOfficerId,
    });

    await db.insert(fieldVerificationReportReviews).values({
      reportId: report1Id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Audited and accepted',
    });

    // Reports for Parcel 2 (ACCEPTED, verified, evidence, audit)
    const [r2] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: caseParcel2Id,
        verifiedBy: fieldOfficerId,
        verificationDate: new Date('2026-03-02T10:00:00Z'),
        outcome: 'VERIFIED',
        observations: 'Commercial structure verified',
        measuredArea: '1410.0000',
        measuredAreaUnit: 'SQ_M',
        status: 'ACCEPTED',
        submittedAt: new Date('2026-03-03T10:00:00Z'),
        reviewedBy: landOfficerId,
        reviewedAt: new Date('2026-03-04T10:00:00Z'),
        reviewDecision: 'ACCEPTED',
        reviewRemarks: 'Accepted following survey verification',
        revisionNumber: 1,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    report2Id = r2.id;
    createdReportIds.push(report2Id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: report2Id,
      evidenceType: 'SKETCH',
      fileReference: `evidence-p2-${ts}.pdf`,
      caption: 'p2 gps survey',
      createdBy: fieldOfficerId,
    });

    await db.insert(fieldVerificationReportReviews).values({
      reportId: report2Id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Audited and accepted',
    });

    // Resolved discrepancy on Parcel 2
    const [disc] = await db
      .insert(parcelDiscrepancies)
      .values({
        caseId: eligibleCaseId,
        caseParcelId: caseParcel2Id,
        reportId: report2Id,
        category: 'AREA_MISMATCH',
        description: 'Minor variance between recorded and measured area',
        status: 'RESOLVED',
        createdBy: landOfficerId,
      })
      .returning({ id: parcelDiscrepancies.id });
    discrepancyId = disc.id;
    createdDiscrepancyIds.push(discrepancyId);

    await db.insert(discrepancyResolutionHistory).values({
      discrepancyId,
      decision: 'RESOLVED',
      remarks: 'Area variance reconciled with village map',
      resolvedBy: landOfficerId,
    });
  });

  after(async () => {
    try {
      if (createdCaseIds.length > 0) {
        await db
          .delete(verifiedLandInventories)
          .where(inArray(verifiedLandInventories.caseId, createdCaseIds));
        await db
          .delete(acquisitionCases)
          .where(inArray(acquisitionCases.id, createdCaseIds));
      }
      if (createdProjectIds.length > 0) {
        await db.delete(projects).where(inArray(projects.id, createdProjectIds));
      }
      if (createdParcelIds.length > 0) {
        await db.delete(landParcels).where(inArray(landParcels.id, createdParcelIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } catch {
      // Best effort cleanup
    }
  });

  it('1. Sidebar navigation contains Verified Land Inventory under Land Acquisition', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const sidebarPath = path.resolve('src/components/layout/sidebar.tsx');
    const content = await fs.readFile(sidebarPath, 'utf-8');

    assert.ok(content.includes('Land Acquisition'), 'Sidebar must contain group "Land Acquisition"');
    assert.ok(
      content.includes('Verified Land Inventory'),
      'Sidebar must have "Verified Land Inventory" navigation item'
    );
    assert.ok(
      content.includes("href: '/verified-land-inventories'"),
      'Navigation item must link to /verified-land-inventories'
    );
  });

  it('2. Lists eligible completed cases and excludes incomplete cases for inventory generation', async () => {
    const req = makeReq(
      'GET',
      'http://localhost:3000/api/acquisition-cases?status=FIELD_VERIFICATION_COMPLETED',
      landOfficerCookie
    );
    const res = await listAcquisitionCasesHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));

    const eligibleMatch = json.data.find((c: { id: string }) => c.id === eligibleCaseId);
    assert.ok(eligibleMatch, 'Eligible case must be present in completed list');

    const ineligibleMatch = json.data.find((c: { id: string }) => c.id === ineligibleCaseId);
    assert.equal(ineligibleMatch, undefined, 'Ineligible case must not appear in completed list');
  });

  it('3. Ineligible case rejects inventory generation attempts', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${ineligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'Premature generation' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: ineligibleCaseId }),
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.error, /field verification has not been completed/i);
  });

  it('4. Dashboard returns summary metrics structure', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/verified-land-inventories/dashboard', landOfficerCookie);
    const res = await getDashboardHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.summary, 'Summary metric object must be present');
    assert.equal(typeof json.summary.total, 'number');
    assert.equal(typeof json.summary.draft, 'number');
    assert.equal(typeof json.summary.pendingReview, 'number');
    assert.equal(typeof json.summary.approved, 'number');
    assert.equal(typeof json.summary.correctionRequested, 'number');
  });

  let generatedInventoryId: string;

  it('5. LAND_OFFICER generates inventory v1 with immutable parcel snapshots', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'First generation from UI' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.versionNumber, 1);
    assert.equal(json.data.status, 'DRAFT');
    assert.equal(json.data.totalParcelCount, 2);
    assert.equal(Number(json.data.aggregateAffectedArea), 2000); // 600 + 1400

    generatedInventoryId = json.data.id;
  });

  it('6. Dashboard metrics reflect the newly created DRAFT inventory', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/verified-land-inventories/dashboard', landOfficerCookie);
    const res = await getDashboardHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.ok(json.summary.total >= 1);
    assert.ok(json.summary.draft >= 1);

    const item = json.data.find(
      (row: { inventory: { id: string } }) => row.inventory.id === generatedInventoryId
    );
    assert.ok(item, 'Generated inventory must appear in dashboard list');
    assert.equal(item.inventory.versionNumber, 1);
    assert.equal(item.inventory.status, 'DRAFT');
    assert.equal(item.acquisitionCase.caseReference, `ACQ-UI-${ts}`);
    assert.equal(item.preparer.name, `UI KA Land Officer ${ts}`);
  });

  it('7. Detail view returns full inventory, immutable snapshots, and geometry fallback message', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/verified-land-inventories/${generatedInventoryId}`,
      landOfficerCookie
    );
    const res = await getInventoryHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.id, generatedInventoryId);
    assert.equal(json.data.snapshots.length, 2);

    const snap1 = json.data.snapshots.find(
      (s: { parcelId: string }) => s.parcelId === parcel1Id
    );
    assert.ok(snap1, 'Snapshot for parcel 1 must exist');
    assert.equal(snap1.surveyNumber, `SY-201-${ts}`);
    assert.equal(snap1.hissaNumber, '1A');
    assert.equal(Number(snap1.recordedArea), 1000);
    assert.equal(Number(snap1.proposedAffectedArea), 600);
    assert.equal(snap1.geometry, null, 'Geometry is null; UI cleanly renders fallback message');
  });

  it('8. LAND_OFFICER submits draft inventory for Ministry review', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/verified-land-inventories/${generatedInventoryId}/submit`,
      landOfficerCookie,
      { remarks: 'Submitted by Land Officer from UI' }
    );
    const res = await submitInventoryHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'SUBMITTED');
  });

  it('9. Dashboard metrics reflect transition to pending Ministry review', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/verified-land-inventories/dashboard', landOfficerCookie);
    const res = await getDashboardHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.ok(json.summary.pendingReview >= 1);
  });

  it('10. MINISTRY_ADMIN records CORRECTION_REQUESTED decision with mandatory remarks', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/verified-land-inventories/${generatedInventoryId}/decision`,
      ministryAdminCookie,
      {
        decision: 'REQUEST_CORRECTIONS',
        remarks: 'Please verify village name spelling on survey 202 and re-calculate area.',
      }
    );
    const res = await reviewDecisionHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'CORRECTION_REQUESTED');
    assert.equal(
      json.data.reviewRemarks,
      'Please verify village name spelling on survey 202 and re-calculate area.'
    );
  });

  let revisedInventoryId: string;

  it('11. LAND_OFFICER generates revised inventory v2 following correction request', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'Revised version addressing Ministry remarks' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.versionNumber, 2);
    assert.equal(json.data.status, 'DRAFT');
    assert.equal(json.data.previousVersionId, generatedInventoryId);

    revisedInventoryId = json.data.id;
  });

  it('12. Version history lists all versions preserving v1 in read-only mode alongside v2', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie
    );
    const res = await listVersionsHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 2);

    const v1 = json.data.find((v: { versionNumber: number }) => v.versionNumber === 1);
    const v2 = json.data.find((v: { versionNumber: number }) => v.versionNumber === 2);

    assert.ok(v1, 'Version 1 must remain available in version history');
    assert.equal(v1.status, 'CORRECTION_REQUESTED');
    assert.equal(
      v1.reviewRemarks,
      'Please verify village name spelling on survey 202 and re-calculate area.'
    );

    assert.ok(v2, 'Version 2 must be listed in version history');
    assert.equal(v2.status, 'DRAFT');
    assert.equal(v2.id, revisedInventoryId);
  });

  it('13. Super Admin has unrestricted scope to view dashboard inventories', async () => {
    const req = makeReq(
      'GET',
      'http://localhost:3000/api/verified-land-inventories/dashboard',
      superAdminCookie
    );
    const res = await getDashboardHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.length >= 1);
  });
});
