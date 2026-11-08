import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { roles } from '../../db/schema/roles';
import { userRoles } from '../../db/schema/user-roles';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { userAssignments } from '../../db/schema/user-assignments';
import { projects } from '../../db/schema/projects';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import {
  acquisitionCases,
  acquisitionCaseWorkflowHistory,
} from '../../db/schema/acquisition-cases';
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../db/schema/field-verification-evidence';
import { fieldVerificationReportReviews } from '../../db/schema/field-verification-report-reviews';
import { parcelDiscrepancies } from '../../db/schema/parcel-discrepancies';
import { discrepancyInvestigations } from '../../db/schema/discrepancy-investigations';
import { discrepancyResolutionHistory } from '../../db/schema/discrepancy-resolution-history';
import {
  verifiedLandInventories,
  inventoryParcelSnapshots,
  verifiedLandInventoryWorkflowHistory,
} from '../../db/schema/verified-land-inventories';
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
import { GET as listSubmittedHandler } from '../../src/app/api/verified-land-inventories/route';

describe('NLAMS — Verified Land Inventory Backend Foundation', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let outOfScopeLandOfficerId: string;
  let outOfScopeLandOfficerCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let outOfScopeMinistryAdminId: string;
  let outOfScopeMinistryAdminCookie: string;

  let dualPreparerAdminId: string;
  let dualPreparerAdminCookie: string;

  let projectOfficerId: string;
  let projectOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;
  let projectId: string;

  let eligibleCaseId: string;
  let parcel1Id: string;
  let parcel2Id: string;
  let caseParcel1Id: string;
  let caseParcel2Id: string;
  let report1Id: string;
  let report2Id: string;
  let discrepancyId: string;

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdDiscrepancyIds: string[] = [];
  const createdInventoryIds: string[] = [];

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

    const [mh] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'MH'))
      .limit(1);
    unitIdMH = mh.id;

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
    const [poRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'PROJECT_OFFICER'))
      .limit(1);
    const [foRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'FIELD_OFFICER'))
      .limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const makeUser = async (
      nameSuffix: string,
      emailPrefix: string,
      status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
    ) => {
      const [u] = await db
        .insert(users)
        .values({
          name: `${nameSuffix} ${ts}`,
          email: `${emailPrefix}.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status,
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

    // Land Officer (KA assignment)
    landOfficerId = await makeUser('KA Land Officer', 'ka.lo');
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

    // Out of scope Land Officer (MH assignment)
    outOfScopeLandOfficerId = await makeUser('MH Land Officer', 'mh.lo');
    await db.insert(userRoles).values({
      userId: outOfScopeLandOfficerId,
      roleId: loRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: outOfScopeLandOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    outOfScopeLandOfficerCookie = await makeSession(outOfScopeLandOfficerId);

    // Ministry Admin (KA assignment)
    ministryAdminId = await makeUser('KA Ministry Admin', 'ka.ma');
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

    // Out of scope Ministry Admin (MH assignment)
    outOfScopeMinistryAdminId = await makeUser('MH Ministry Admin', 'mh.ma');
    await db.insert(userRoles).values({
      userId: outOfScopeMinistryAdminId,
      roleId: maRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: outOfScopeMinistryAdminId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    outOfScopeMinistryAdminCookie = await makeSession(outOfScopeMinistryAdminId);

    // Dual preparer user (has both LAND_OFFICER and MINISTRY_ADMIN in KA)
    dualPreparerAdminId = await makeUser('Dual Preparer Admin', 'dual.admin');
    await db.insert(userRoles).values([
      { userId: dualPreparerAdminId, roleId: loRole.id, assignedBy: superAdminId },
      { userId: dualPreparerAdminId, roleId: maRole.id, assignedBy: superAdminId },
    ]);
    await db.insert(userAssignments).values({
      userId: dualPreparerAdminId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    dualPreparerAdminCookie = await makeSession(dualPreparerAdminId);

    // Project Officer
    projectOfficerId = await makeUser('KA Project Officer', 'ka.po');
    await db.insert(userRoles).values({
      userId: projectOfficerId,
      roleId: poRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: projectOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    projectOfficerCookie = await makeSession(projectOfficerId);

    // Field Officer
    fieldOfficerId = await makeUser('KA Field Officer', 'ka.fo');
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
    fieldOfficerCookie = await makeSession(fieldOfficerId);

    // Create Base Project (in KA)
    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-INV-${ts}`,
        name: `Inventory Test Project ${ts}`,
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
        caseReference: `ACQ-INV-${ts}`,
        projectId,
        title: `Eligible Acquisition Case ${ts}`,
        description: 'Case with verified parcels and resolved discrepancies',
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    eligibleCaseId = c.id;
    createdCaseIds.push(eligibleCaseId);

    // Parcel 1: 1000.0000 SQ_M, affected 600.0000 SQ_M
    const [p1] = await db
      .insert(landParcels)
      .values({
        parcelId: `P1-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-101-${ts}`,
        subdivisionNumber: '1A',
        landRecordReference: `RTC-101-${ts}`,
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

    // Parcel 2: 2500.0000 SQ_M, affected 1400.0000 SQ_M
    const [p2] = await db
      .insert(landParcels)
      .values({
        parcelId: `P2-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-102-${ts}`,
        subdivisionNumber: '2B',
        landRecordReference: `RTC-102-${ts}`,
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
      // 1. Delete created verified land inventory records
      if (createdCaseIds.length > 0) {
        await db
          .delete(verifiedLandInventoryWorkflowHistory)
          .where(inArray(verifiedLandInventoryWorkflowHistory.caseId, createdCaseIds));
        await db
          .delete(verifiedLandInventories)
          .where(inArray(verifiedLandInventories.caseId, createdCaseIds));
      }

      // 2. Discrepancies
      if (createdDiscrepancyIds.length > 0) {
        await db
          .delete(discrepancyResolutionHistory)
          .where(inArray(discrepancyResolutionHistory.discrepancyId, createdDiscrepancyIds));
        await db
          .delete(discrepancyInvestigations)
          .where(inArray(discrepancyInvestigations.discrepancyId, createdDiscrepancyIds));
        await db
          .delete(parcelDiscrepancies)
          .where(inArray(parcelDiscrepancies.id, createdDiscrepancyIds));
      }

      // 3. Reports
      if (createdReportIds.length > 0) {
        await db
          .delete(fieldVerificationReportReviews)
          .where(inArray(fieldVerificationReportReviews.reportId, createdReportIds));
        await db
          .delete(fieldVerificationEvidence)
          .where(inArray(fieldVerificationEvidence.reportId, createdReportIds));
        await db
          .delete(fieldVerificationReports)
          .where(inArray(fieldVerificationReports.id, createdReportIds));
      }

      // 4. Case parcels & parcels
      if (createdCaseParcelIds.length > 0) {
        await db
          .delete(acquisitionCaseParcels)
          .where(inArray(acquisitionCaseParcels.id, createdCaseParcelIds));
      }
      if (createdParcelIds.length > 0) {
        await db
          .delete(landParcels)
          .where(inArray(landParcels.id, createdParcelIds));
      }

      // 5. Cases & projects
      if (createdCaseIds.length > 0) {
        await db
          .delete(acquisitionCaseWorkflowHistory)
          .where(inArray(acquisitionCaseWorkflowHistory.caseId, createdCaseIds));
        await db
          .delete(acquisitionCases)
          .where(inArray(acquisitionCases.id, createdCaseIds));
      }
      if (createdProjectIds.length > 0) {
        await db
          .delete(projects)
          .where(inArray(projects.id, createdProjectIds));
      }

      // 6. Users & assignments
      if (createdUserIds.length > 0) {
        await db
          .delete(userAssignments)
          .where(inArray(userAssignments.userId, createdUserIds));
        await db
          .delete(userRoles)
          .where(inArray(userRoles.userId, createdUserIds));
        await db
          .delete(users)
          .where(inArray(users.id, createdUserIds));
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  // -------------------------------------------------------------------------
  // 1. Ineligible Inventory Generation Tests
  // -------------------------------------------------------------------------
  it('1. Rejects inventory generation when case status is not FIELD_VERIFICATION_COMPLETED', async () => {
    // Create a case in AWAITING_FIELD_VERIFICATION
    const [draftCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-INELIGIBLE-${ts}`,
        projectId,
        title: `Ineligible Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(draftCase.id);

    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${draftCase.id}/inventories`,
      landOfficerCookie,
      {}
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: draftCase.id }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /field verification has not been completed/i);
  });

  it('2. Rejects inventory generation when case has no associated parcels', async () => {
    const [emptyCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-NO-PARCELS-${ts}`,
        projectId,
        title: `Empty Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(emptyCase.id);

    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${emptyCase.id}/inventories`,
      landOfficerCookie,
      {}
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: emptyCase.id }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /no linked parcels|no parcels/i);
  });

  it('3. Rejects inventory generation when there is an unresolved discrepancy', async () => {
    // Setup case with open discrepancy
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-OPEN-DISC-${ts}`,
        projectId,
        title: `Case With Open Disc ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);

    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-DISC-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-DISC-${ts}`,
        totalArea: '500.0000',
        areaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: c.id,
        parcelId: p.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp.id);

    const [rpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: cp.id,
        verifiedBy: fieldOfficerId,
        status: 'ACCEPTED',
        outcome: 'VERIFIED',
        reviewedBy: landOfficerId,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(rpt.id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: rpt.id,
      evidenceType: 'PHOTO',
      fileReference: `ev-disc-${ts}.jpg`,
      createdBy: fieldOfficerId,
    });
    await db.insert(fieldVerificationReportReviews).values({
      reportId: rpt.id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Accepted',
    });

    const [openDisc] = await db
      .insert(parcelDiscrepancies)
      .values({
        caseId: c.id,
        caseParcelId: cp.id,
        reportId: rpt.id,
        category: 'BOUNDARY_MISMATCH',
        description: 'Unresolved boundary issue',
        status: 'OPEN',
        createdBy: landOfficerId,
      })
      .returning({ id: parcelDiscrepancies.id });
    createdDiscrepancyIds.push(openDisc.id);

    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${c.id}/inventories`,
      landOfficerCookie,
      {}
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: c.id }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /discrepancy/i);
  });

  it('4. Rejects inventory generation when discrepancy was closed as an administrative exception', async () => {
    // Setup case with exception-resolved discrepancy
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-EXC-DISC-${ts}`,
        projectId,
        title: `Case With Exception Disc ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);

    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-EXC-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-EXC-${ts}`,
        totalArea: '500.0000',
        areaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: c.id,
        parcelId: p.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp.id);

    const [rpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: cp.id,
        verifiedBy: fieldOfficerId,
        status: 'ACCEPTED',
        outcome: 'VERIFIED',
        reviewedBy: landOfficerId,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(rpt.id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: rpt.id,
      evidenceType: 'PHOTO',
      fileReference: `ev-exc-${ts}.jpg`,
      createdBy: fieldOfficerId,
    });
    await db.insert(fieldVerificationReportReviews).values({
      reportId: rpt.id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Accepted',
    });

    const [excDisc] = await db
      .insert(parcelDiscrepancies)
      .values({
        caseId: c.id,
        caseParcelId: cp.id,
        reportId: rpt.id,
        category: 'AREA_MISMATCH',
        description: 'Area mismatch closed by exception',
        status: 'RESOLVED',
        createdBy: landOfficerId,
      })
      .returning({ id: parcelDiscrepancies.id });
    createdDiscrepancyIds.push(excDisc.id);

    await db.insert(discrepancyResolutionHistory).values({
      discrepancyId: excDisc.id,
      decision: 'RESOLVED',
      remarks: 'Administrative exception granted without field resurvey',
      resolvedBy: landOfficerId,
    });

    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${c.id}/inventories`,
      landOfficerCookie,
      {}
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: c.id }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /exception/i);
  });

  it('5. Rejects inventory generation when accepted report is missing evidence', async () => {
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-NO-EVID-${ts}`,
        projectId,
        title: `Case With Missing Evidence ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);

    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-NO-EV-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-NO-EV-${ts}`,
        totalArea: '500.0000',
        areaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: c.id,
        parcelId: p.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp.id);

    const [rpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: cp.id,
        verifiedBy: fieldOfficerId,
        status: 'ACCEPTED',
        outcome: 'VERIFIED',
        reviewedBy: landOfficerId,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(rpt.id);

    await db.insert(fieldVerificationReportReviews).values({
      reportId: rpt.id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Accepted without evidence',
    });

    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${c.id}/inventories`,
      landOfficerCookie,
      {}
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: c.id }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /evidence/i);
  });

  // -------------------------------------------------------------------------
  // 2. Eligible Inventory Generation & Snapshot Accuracy Tests
  // -------------------------------------------------------------------------
  let generatedInventoryId: string;

  it('6. Successfully generates draft inventory Version 1 with correct snapshots and area aggregation', async () => {
    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'Initial draft generation for highway project' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data);

    const inv = body.data;
    generatedInventoryId = inv.id;
    createdInventoryIds.push(generatedInventoryId);

    assert.equal(inv.versionNumber, 1);
    assert.equal(inv.status, 'DRAFT');
    assert.equal(inv.totalParcelCount, 2);
    // Parcel 1: 1000 + Parcel 2: 2500 = 3500.0000
    assert.equal(parseFloat(inv.aggregateRecordedArea), 3500.0);
    // Parcel 1: 600 + Parcel 2: 1400 = 2000.0000
    assert.equal(parseFloat(inv.aggregateAffectedArea), 2000.0);
    assert.equal(inv.areaUnit, 'SQ_M');
    assert.equal(inv.preparedBy, landOfficerId);
    assert.equal(inv.snapshots.length, 2);

    // Verify snapshot fields
    const s1 = inv.snapshots.find(
      (s: any) => s.surveyNumber === `SY-101-${ts}`
    );
    assert.ok(s1);
    assert.equal(s1.hissaNumber, '1A');
    assert.equal(s1.state, 'Karnataka');
    assert.equal(s1.district, 'Bengaluru Urban');
    assert.equal(s1.village, 'Yelahanka');
    assert.equal(parseFloat(s1.recordedArea), 1000.0);
    assert.equal(parseFloat(s1.proposedAffectedArea), 600.0);
    assert.equal(parseFloat(s1.fieldMeasuredArea), 595.0);
    assert.equal(s1.acceptedReportId, report1Id);

    const s2 = inv.snapshots.find(
      (s: any) => s.surveyNumber === `SY-102-${ts}`
    );
    assert.ok(s2);
    assert.equal(s2.hissaNumber, '2B');
    assert.equal(parseFloat(s2.recordedArea), 2500.0);
    assert.equal(parseFloat(s2.proposedAffectedArea), 1400.0);
    assert.equal(parseFloat(s2.fieldMeasuredArea), 1410.0);
    assert.equal(s2.acceptedReportId, report2Id);
    // Discrepancy details preserved on snapshot
    assert.ok(Array.isArray(s2.discrepancyDetails));
    assert.equal(s2.discrepancyDetails.length, 1);
    assert.equal(s2.discrepancyDetails[0].category, 'AREA_MISMATCH');
    assert.equal(
      s2.discrepancyDetails[0].resolutionRemarks,
      'Area variance reconciled with village map'
    );

    // Verify workflow history audit record
    assert.ok(inv.workflowHistory.length >= 1);
    const genWf = inv.workflowHistory.find((w: any) => w.action === 'GENERATE');
    assert.ok(genWf);
    assert.equal(genWf.actorId, landOfficerId);
    assert.equal(genWf.toStatus, 'DRAFT');
  });

  it('7. Preserves snapshot immutability when source land_parcels row is updated', async () => {
    // Mutate source land_parcels record directly
    await db
      .update(landParcels)
      .set({
        totalArea: '9999.0000',
        surveyNumber: 'SY-MUTATED-999',
        village: 'MutatedVillage',
      })
      .where(eq(landParcels.id, parcel1Id));

    // Fetch snapshot directly from DB
    const [snapshot] = await db
      .select()
      .from(inventoryParcelSnapshots)
      .where(
        sql`${inventoryParcelSnapshots.inventoryId} = ${generatedInventoryId}::uuid AND ${inventoryParcelSnapshots.parcelId} = ${parcel1Id}::uuid`
      );

    assert.ok(snapshot);
    // Snapshot MUST remain unchanged!
    assert.equal(parseFloat(snapshot.recordedArea), 1000.0);
    assert.equal(snapshot.surveyNumber, `SY-101-${ts}`);
    assert.equal(snapshot.village, 'Yelahanka');

    // Restore parcel for subsequent tests
    await db
      .update(landParcels)
      .set({
        totalArea: '1000.0000',
        surveyNumber: `SY-101-${ts}`,
        village: 'Yelahanka',
      })
      .where(eq(landParcels.id, parcel1Id));
  });

  it('8. Allows controlled draft regeneration while inventory is in DRAFT status', async () => {
    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'Regenerating draft with refreshed data' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, generatedInventoryId);
    assert.equal(body.data.versionNumber, 1);
    assert.equal(body.data.status, 'DRAFT');

    // Check REGENERATE history entry appended
    const regenWf = body.data.workflowHistory.find(
      (w: any) => w.action === 'REGENERATE'
    );
    assert.ok(regenWf);
    assert.equal(regenWf.actorId, landOfficerId);
  });

  // -------------------------------------------------------------------------
  // 3. Authorization Tests for LAND_OFFICER and Roles
  // -------------------------------------------------------------------------
  it('9. Unauthorized roles cannot generate inventory (403 Forbidden)', async () => {
    // Field Officer cannot generate
    const foReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      fieldOfficerCookie,
      {}
    );
    const foRes = await generateInventoryHandler(foReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(foRes.status, 403);

    // Project Officer cannot generate
    const poReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      projectOfficerCookie,
      {}
    );
    const poRes = await generateInventoryHandler(poReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(poRes.status, 403);

    // Out of scope Land Officer cannot generate
    const oosReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      outOfScopeLandOfficerCookie,
      {}
    );
    const oosRes = await generateInventoryHandler(oosReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(oosRes.status, 403);

    // Unauthenticated returns 401
    const unauthReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      undefined,
      {}
    );
    const unauthRes = await generateInventoryHandler(unauthReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(unauthRes.status, 401);
  });

  // -------------------------------------------------------------------------
  // 4. Submission Workflow Tests
  // -------------------------------------------------------------------------
  it('10. LAND_OFFICER successfully submits draft inventory for Ministry review', async () => {
    const req = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${generatedInventoryId}/submit`,
      landOfficerCookie,
      { remarks: 'Submitting Version 1 for formal Ministry review' }
    );
    const res = await submitInventoryHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'SUBMITTED');
    assert.equal(body.data.submittedBy, landOfficerId);
    assert.ok(body.data.submittedAt);

    // Workflow history has SUBMIT
    const subWf = body.data.workflowHistory.find(
      (w: any) => w.action === 'SUBMIT'
    );
    assert.ok(subWf);
    assert.equal(subWf.fromStatus, 'DRAFT');
    assert.equal(subWf.toStatus, 'SUBMITTED');
  });

  it('11. Submitted inventory cannot be submitted again or edited (409 Conflict)', async () => {
    // Attempting to submit an already submitted inventory returns 409
    const req = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${generatedInventoryId}/submit`,
      landOfficerCookie,
      {}
    );
    const res = await submitInventoryHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });
    assert.equal(res.status, 409);

    // Cannot generate a new version while current version is pending review
    const genReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      {}
    );
    const genRes = await generateInventoryHandler(genReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(genRes.status, 409);
  });

  it('12. Lists submitted inventories for authorized Ministry Admin', async () => {
    // In-scope Ministry Admin can see submitted inventories
    const req = makeReq(
      'GET',
      'http://localhost/api/verified-land-inventories',
      ministryAdminCookie
    );
    const res = await listSubmittedHandler(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    const found = body.data.find(
      (item: any) => item.inventory.id === generatedInventoryId
    );
    assert.ok(found);
    assert.equal(found.acquisitionCase.caseReference, `ACQ-INV-${ts}`);

    // Out-of-scope Ministry Admin (MH) does not see the KA inventory
    const oosReq = makeReq(
      'GET',
      'http://localhost/api/verified-land-inventories',
      outOfScopeMinistryAdminCookie
    );
    const oosRes = await listSubmittedHandler(oosReq);
    assert.equal(oosRes.status, 200);
    const oosBody = await oosRes.json();
    const oosFound = oosBody.data.find(
      (item: any) => item.inventory.id === generatedInventoryId
    );
    assert.equal(oosFound, undefined);

    // Land Officer cannot call list submitted inventories
    const loReq = makeReq(
      'GET',
      'http://localhost/api/verified-land-inventories',
      landOfficerCookie
    );
    const loRes = await listSubmittedHandler(loReq);
    assert.equal(loRes.status, 403);
  });

  // -------------------------------------------------------------------------
  // 5. Ministry Review Decision & Mandatory Remarks Tests
  // -------------------------------------------------------------------------
  it('13. Enforces mandatory remarks when Ministry Admin requests corrections or rejects', async () => {
    // Request corrections without remarks is rejected (400)
    const noRemarksReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${generatedInventoryId}/decision`,
      ministryAdminCookie,
      { decision: 'REQUEST_CORRECTIONS', remarks: '   ' }
    );
    const noRemarksRes = await reviewDecisionHandler(noRemarksReq, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });
    assert.equal(noRemarksRes.status, 400);
    const body = await noRemarksRes.json();
    assert.match(body.error, /remarks are mandatory/i);

    // Reject without remarks is rejected (400)
    const noRemarksRejReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${generatedInventoryId}/decision`,
      ministryAdminCookie,
      { decision: 'REJECT' }
    );
    const noRemarksRejRes = await reviewDecisionHandler(noRemarksRejReq, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });
    assert.equal(noRemarksRejRes.status, 400);
  });

  it('14. Ministry Admin requests corrections with remarks -> CORRECTION_REQUESTED', async () => {
    const req = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${generatedInventoryId}/decision`,
      ministryAdminCookie,
      {
        decision: 'REQUEST_CORRECTIONS',
        remarks: 'Please recheck compensation calculation details for Parcel 2',
      }
    );
    const res = await reviewDecisionHandler(req, {
      params: Promise.resolve({ id: generatedInventoryId }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'CORRECTION_REQUESTED');
    assert.equal(body.data.reviewedBy, ministryAdminId);
    assert.equal(
      body.data.reviewRemarks,
      'Please recheck compensation calculation details for Parcel 2'
    );

    const wf = body.data.workflowHistory.find(
      (w: any) => w.action === 'REQUEST_CORRECTIONS'
    );
    assert.ok(wf);
    assert.equal(wf.toStatus, 'CORRECTION_REQUESTED');
  });

  // -------------------------------------------------------------------------
  // 6. Versioning, Previous Version Preservation & Resubmission
  // -------------------------------------------------------------------------
  let version2InventoryId: string;

  it('15. Corrections trigger new inventory Version 2 while preserving Version 1 and snapshots', async () => {
    // Land officer generates revised version after corrections
    const req = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie,
      { remarks: 'Generated revised Version 2 following Ministry corrections' }
    );
    const res = await generateInventoryHandler(req, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);

    const v2 = body.data;
    version2InventoryId = v2.id;
    createdInventoryIds.push(version2InventoryId);

    assert.equal(v2.versionNumber, 2);
    assert.equal(v2.status, 'DRAFT');
    assert.equal(v2.previousVersionId, generatedInventoryId);
    assert.equal(v2.totalParcelCount, 2);

    // Verify Version 1 is preserved intact in database
    const [v1] = await db
      .select()
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.id, generatedInventoryId));
    assert.ok(v1);
    assert.equal(v1.versionNumber, 1);
    assert.equal(v1.status, 'CORRECTION_REQUESTED');
    assert.equal(v1.reviewedBy, ministryAdminId);

    // Verify Version 1 snapshots remain intact
    const v1Snapshots = await db
      .select()
      .from(inventoryParcelSnapshots)
      .where(eq(inventoryParcelSnapshots.inventoryId, generatedInventoryId));
    assert.equal(v1Snapshots.length, 2);

    // List versions endpoint returns both versions
    const listReq = makeReq(
      'GET',
      `http://localhost/api/acquisition-cases/${eligibleCaseId}/inventories`,
      landOfficerCookie
    );
    const listRes = await listVersionsHandler(listReq, {
      params: Promise.resolve({ id: eligibleCaseId }),
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 2);
    assert.equal(listBody.data[0].versionNumber, 1);
    assert.equal(listBody.data[1].versionNumber, 2);
  });

  // -------------------------------------------------------------------------
  // 7. Ministry Approval Authorization & Separation of Duties
  // -------------------------------------------------------------------------
  it('16. Non-MINISTRY_ADMIN users and out-of-scope Ministry Admins cannot approve (403 Forbidden)', async () => {
    // First submit Version 2
    const subReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/submit`,
      landOfficerCookie,
      { remarks: 'Submitting Version 2' }
    );
    const subRes = await submitInventoryHandler(subReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(subRes.status, 200);

    // Project Officer cannot approve
    const poReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      projectOfficerCookie,
      { decision: 'APPROVE' }
    );
    const poRes = await reviewDecisionHandler(poReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(poRes.status, 403);

    // Field Officer cannot approve
    const foReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      fieldOfficerCookie,
      { decision: 'APPROVE' }
    );
    const foRes = await reviewDecisionHandler(foReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(foRes.status, 403);

    // Land Officer cannot approve
    const loReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      landOfficerCookie,
      { decision: 'APPROVE' }
    );
    const loRes = await reviewDecisionHandler(loReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(loRes.status, 403);

    // Super Admin cannot bypass approval without MINISTRY_ADMIN role
    const saReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      superAdminCookie,
      { decision: 'APPROVE' }
    );
    const saRes = await reviewDecisionHandler(saReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(saRes.status, 403);

    // Out-of-scope Ministry Admin (MH) cannot approve
    const oosReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      outOfScopeMinistryAdminCookie,
      { decision: 'APPROVE' }
    );
    const oosRes = await reviewDecisionHandler(oosReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(oosRes.status, 403);
  });

  it('17. Enforces separation of duties: Preparer cannot approve their own inventory (403 Forbidden)', async () => {
    // Generate an inventory prepared by dualPreparerAdminId (who is both LO and MA)
    // Setup a new case
    const [dualCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-DUAL-${ts}`,
        projectId,
        title: `Dual Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: dualPreparerAdminId,
        updatedBy: dualPreparerAdminId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(dualCase.id);

    const [dp] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-DUAL-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-DUAL-${ts}`,
        totalArea: '500.0000',
        areaUnit: 'SQ_M',
        createdBy: dualPreparerAdminId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(dp.id);

    const [dcp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: dualCase.id,
        parcelId: dp.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: dualPreparerAdminId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(dcp.id);

    const [drpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: dcp.id,
        verifiedBy: fieldOfficerId,
        status: 'ACCEPTED',
        outcome: 'VERIFIED',
        reviewedBy: landOfficerId,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(drpt.id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: drpt.id,
      evidenceType: 'PHOTO',
      fileReference: `ev-dual-${ts}.jpg`,
      createdBy: fieldOfficerId,
    });
    await db.insert(fieldVerificationReportReviews).values({
      reportId: drpt.id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Accepted',
    });

    // Dual admin generates inventory (so preparedBy = dualPreparerAdminId)
    const genReq = makeReq(
      'POST',
      `http://localhost/api/acquisition-cases/${dualCase.id}/inventories`,
      dualPreparerAdminCookie,
      {}
    );
    const genRes = await generateInventoryHandler(genReq, {
      params: Promise.resolve({ id: dualCase.id }),
    });
    assert.equal(genRes.status, 201);
    const genBody = await genRes.json();
    const dualInvId = genBody.data.id;
    createdInventoryIds.push(dualInvId);

    // Submit inventory
    const subReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${dualInvId}/submit`,
      dualPreparerAdminCookie,
      {}
    );
    await submitInventoryHandler(subReq, {
      params: Promise.resolve({ id: dualInvId }),
    });

    // Dual admin attempts to approve their own inventory -> 403 Forbidden!
    const appReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${dualInvId}/decision`,
      dualPreparerAdminCookie,
      { decision: 'APPROVE', remarks: 'Self approval' }
    );
    const appRes = await reviewDecisionHandler(appReq, {
      params: Promise.resolve({ id: dualInvId }),
    });
    assert.equal(appRes.status, 403);
    const appBody = await appRes.json();
    assert.match(appBody.error, /preparer cannot approve/i);
  });

  // -------------------------------------------------------------------------
  // 8. Ministry Approval & Immutability Tests
  // -------------------------------------------------------------------------
  it('18. Ministry Admin approves Version 2 -> APPROVED and becomes immutable', async () => {
    const req = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      ministryAdminCookie,
      { decision: 'APPROVE', remarks: 'All parcel records and areas fully verified and approved.' }
    );
    const res = await reviewDecisionHandler(req, {
      params: Promise.resolve({ id: version2InventoryId }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'APPROVED');
    assert.equal(body.data.reviewedBy, ministryAdminId);
    assert.ok(body.data.reviewedAt);

    // Attempting any further review decisions on APPROVED inventory fails (409 Conflict)
    const secondReq = makeReq(
      'POST',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}/decision`,
      ministryAdminCookie,
      { decision: 'REJECT', remarks: 'Attempt to reject approved inventory' }
    );
    const secondRes = await reviewDecisionHandler(secondReq, {
      params: Promise.resolve({ id: version2InventoryId }),
    });
    assert.equal(secondRes.status, 409);
    const secondBody = await secondRes.json();
    assert.match(secondBody.error, /immutable/i);
  });

  // -------------------------------------------------------------------------
  // 9. Details Retrieval Tests
  // -------------------------------------------------------------------------
  it('19. Retrieves full inventory details with snapshots, case, and workflow history', async () => {
    const req = makeReq(
      'GET',
      `http://localhost/api/verified-land-inventories/${version2InventoryId}`,
      ministryAdminCookie
    );
    const res = await getInventoryHandler(req, {
      params: Promise.resolve({ id: version2InventoryId }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, version2InventoryId);
    assert.equal(body.data.versionNumber, 2);
    assert.equal(body.data.status, 'APPROVED');
    assert.ok(body.data.preparer);
    assert.ok(body.data.reviewer);
    assert.ok(body.data.acquisitionCase);
    assert.ok(body.data.acquisitionCase.project);
    assert.equal(body.data.snapshots.length, 2);
    assert.ok(body.data.workflowHistory.length >= 3);
  });

  // -------------------------------------------------------------------------
  // 10. Concurrency Tests
  // -------------------------------------------------------------------------
  it('20. Protects against duplicate concurrent inventory generation requests', async () => {
    // Setup a new eligible case
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-CONCUR-${ts}`,
        projectId,
        title: `Concurrent Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);

    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-CONCUR-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: `SY-CONCUR-${ts}`,
        totalArea: '500.0000',
        areaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: c.id,
        parcelId: p.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp.id);

    const [rpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId: cp.id,
        verifiedBy: fieldOfficerId,
        status: 'ACCEPTED',
        outcome: 'VERIFIED',
        reviewedBy: landOfficerId,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(rpt.id);

    await db.insert(fieldVerificationEvidence).values({
      reportId: rpt.id,
      evidenceType: 'PHOTO',
      fileReference: `ev-concur-${ts}.jpg`,
      createdBy: fieldOfficerId,
    });
    await db.insert(fieldVerificationReportReviews).values({
      reportId: rpt.id,
      reviewerId: landOfficerId,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
      decision: 'ACCEPTED',
      remarks: 'Accepted',
    });

    // Fire 2 generation requests concurrently
    const makeGenReq = () =>
      makeReq(
        'POST',
        `http://localhost/api/acquisition-cases/${c.id}/inventories`,
        landOfficerCookie,
        { remarks: 'Concurrent generation' }
      );

    const [res1, res2] = await Promise.all([
      generateInventoryHandler(makeGenReq(), {
        params: Promise.resolve({ id: c.id }),
      }),
      generateInventoryHandler(makeGenReq(), {
        params: Promise.resolve({ id: c.id }),
      }),
    ]);

    // Both should succeed (one creates, the second regenerates draft) or one creates and one regenerates
    assert.ok(res1.status === 201 || res1.status === 200);
    assert.ok(res2.status === 201 || res2.status === 200);

    // Verify exactly ONE inventory record was created (version 1), no duplicates!
    const inventories = await db
      .select()
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.caseId, c.id));
    assert.equal(inventories.length, 1);
    assert.equal(inventories[0].versionNumber, 1);
    createdInventoryIds.push(inventories[0].id);
  });
});
