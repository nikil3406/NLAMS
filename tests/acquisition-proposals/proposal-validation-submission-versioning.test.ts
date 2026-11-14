import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db, client } from '../../db';
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
import {
  verifiedLandInventories,
  inventoryParcelSnapshots,
  verifiedLandInventoryWorkflowHistory,
} from '../../db/schema/verified-land-inventories';
import {
  acquisitionProposals,
  acquisitionProposalVersions,
  acquisitionProposalWorkflowHistory,
} from '../../db/schema/acquisition-proposals';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as createProposalHandler } from '../../src/app/api/acquisition-proposals/route';
import {
  GET as getProposalHandler,
  PATCH as updateProposalHandler,
} from '../../src/app/api/acquisition-proposals/[id]/route';
import { POST as validateProposalHandler } from '../../src/app/api/acquisition-proposals/[id]/validate/route';
import { POST as submitProposalHandler } from '../../src/app/api/acquisition-proposals/[id]/submit/route';
import {
  GET as getProposalVersionsHandler,
  POST as createProposalVersionHandler,
} from '../../src/app/api/acquisition-proposals/[id]/versions/route';
import { GET as getProposalVersionDetailHandler } from '../../src/app/api/acquisition-proposals/[id]/versions/[versionId]/route';

describe('NLAMS – Step 2: Proposal Validation, Submission & Version Management', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let projectOfficerId: string;
  let projectOfficerCookie: string;

  let secondProjectOfficerId: string;
  let secondProjectOfficerCookie: string;

  let outOfScopeOfficerId: string;
  let outOfScopeOfficerCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  let registeredProjectId: string;
  let eligibleCaseId: string;
  let invalidAreaCaseId: string;

  let approvedInventoryId: string;
  let unapprovedInventoryId: string;
  let invalidAreaInventoryId: string;

  let validProposalId: string;
  let invalidProposalId: string;

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdInventoryIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];

  const makeReq = (
    method: 'GET' | 'POST' | 'PATCH',
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
    const [poRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'PROJECT_OFFICER'))
      .limit(1);
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

    // Primary Implementing Agency user (PROJECT_OFFICER in KA)
    projectOfficerId = await makeUser('KA Project Officer Creator', 'po.sub.creator');
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

    // Second Implementing Agency user (PROJECT_OFFICER in KA)
    secondProjectOfficerId = await makeUser('KA Project Officer Other', 'po.sub.other');
    await db.insert(userRoles).values({
      userId: secondProjectOfficerId,
      roleId: poRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: secondProjectOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    secondProjectOfficerCookie = await makeSession(secondProjectOfficerId);

    // Out of scope Project Officer (assigned to MH)
    outOfScopeOfficerId = await makeUser('MH Project Officer', 'po.sub.mh');
    await db.insert(userRoles).values({
      userId: outOfScopeOfficerId,
      roleId: poRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: outOfScopeOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    outOfScopeOfficerCookie = await makeSession(outOfScopeOfficerId);

    // Land Officer (KA assignment)
    landOfficerId = await makeUser('KA Land Officer', 'ka.sub.lo');
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

    // Ministry Admin (KA assignment)
    ministryAdminId = await makeUser('KA Ministry Admin', 'ka.sub.ma');
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

    // 5. Create Infrastructure Project
    const [p1] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-VAL-${ts}`,
        name: `High-Speed Freight Rail Corridor ${ts}`,
        projectType: 'Railway',
        implementingAgencyId: agencyId,
        administrativeUnitId: unitIdKA,
        status: 'REGISTERED',
        createdBy: projectOfficerId,
      })
      .returning({ id: projects.id });
    registeredProjectId = p1.id;
    createdProjectIds.push(registeredProjectId);

    // 6. Create Acquisition Cases
    // Case 1: Standard Eligible Case
    const [c1] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-VAL-${ts}`,
        projectId: registeredProjectId,
        title: `Rail Corridor Sector 1 ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    eligibleCaseId = c1.id;
    createdCaseIds.push(eligibleCaseId);

    // Case 2: Case with area inconsistency
    const [c2] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-INVAREA-${ts}`,
        projectId: registeredProjectId,
        title: `Area Discrepancy Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    invalidAreaCaseId = c2.id;
    createdCaseIds.push(invalidAreaCaseId);

    // 7. Create Land Parcels and Snapshots
    // Valid Parcel for Case 1
    const [parcel1] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-VAL-1-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru South',
        village: 'Varthur',
        surveyNumber: `SY-201-${ts}`,
        totalArea: '10000.0000',
        areaUnit: 'SQ_M',
        landUse: 'AGRICULTURAL',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(parcel1.id);

    const [cp1] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: eligibleCaseId,
        parcelId: parcel1.id,
        proposedAffectedArea: '4000.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp1.id);

    // 8. Create Verified Land Inventories
    // Inventory 1: APPROVED for Case 1 (4000 SQ_M)
    const [inv1] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: eligibleCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '10000.0000',
        aggregateAffectedArea: '4000.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
        submittedBy: landOfficerId,
        submittedAt: new Date('2026-03-01T10:00:00Z'),
        reviewedBy: ministryAdminId,
        reviewedAt: new Date('2026-03-02T10:00:00Z'),
        reviewRemarks: 'Inventory verified and accepted by Ministry',
      })
      .returning({ id: verifiedLandInventories.id });
    approvedInventoryId = inv1.id;
    createdInventoryIds.push(approvedInventoryId);

    // Snapshot for Inventory 1
    await db.insert(inventoryParcelSnapshots).values({
      inventoryId: approvedInventoryId,
      parcelId: parcel1.id,
      caseParcelId: cp1.id,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru South',
      village: 'Varthur',
      surveyNumber: `SY-201-${ts}`,
      recordedArea: '10000.0000',
      recordedAreaUnit: 'SQ_M',
      proposedAffectedArea: '4000.0000',
      proposedAffectedAreaUnit: 'SQ_M',
    });

    // Inventory 2: DRAFT for Case 1 (unapproved)
    const [inv2] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: eligibleCaseId,
        versionNumber: 2,
        status: 'DRAFT',
        totalParcelCount: 1,
        aggregateRecordedArea: '10000.0000',
        aggregateAffectedArea: '4000.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
      })
      .returning({ id: verifiedLandInventories.id });
    unapprovedInventoryId = inv2.id;
    createdInventoryIds.push(unapprovedInventoryId);

    // Inventory 3: APPROVED for Case 2 with area violation:
    // affectedArea (8000) > recordedArea (5000)
    const [parcel2] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-INVAREA-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru South',
        village: 'Whitefield',
        surveyNumber: `SY-999-${ts}`,
        totalArea: '5000.0000',
        areaUnit: 'SQ_M',
        landUse: 'COMMERCIAL',
        createdBy: landOfficerId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(parcel2.id);

    const [cp2] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: invalidAreaCaseId,
        parcelId: parcel2.id,
        proposedAffectedArea: '8000.0000', // exceeds 5000
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp2.id);

    const [inv3] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: invalidAreaCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '5000.0000',
        aggregateAffectedArea: '8000.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
        reviewedBy: ministryAdminId,
        reviewedAt: new Date('2026-03-02T10:00:00Z'),
      })
      .returning({ id: verifiedLandInventories.id });
    invalidAreaInventoryId = inv3.id;
    createdInventoryIds.push(invalidAreaInventoryId);

    // Snapshot with violation: proposed affected (8000) > recorded (5000)
    await db.insert(inventoryParcelSnapshots).values({
      inventoryId: invalidAreaInventoryId,
      parcelId: parcel2.id,
      caseParcelId: cp2.id,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru South',
      village: 'Whitefield',
      surveyNumber: `SY-999-${ts}`,
      recordedArea: '5000.0000',
      recordedAreaUnit: 'SQ_M',
      proposedAffectedArea: '8000.0000', // Violation
      proposedAffectedAreaUnit: 'SQ_M',
    });
  });

  after(async () => {
    try {
      // 1. Delete proposals and related versions/history
      if (createdCaseIds.length > 0) {
        const props = await db
          .select({ id: acquisitionProposals.id })
          .from(acquisitionProposals)
          .where(inArray(acquisitionProposals.acquisitionCaseId, createdCaseIds));
        const propIds = props.map((p) => p.id);

        if (propIds.length > 0) {
          await db
            .delete(acquisitionProposalWorkflowHistory)
            .where(inArray(acquisitionProposalWorkflowHistory.proposalId, propIds));
          await db
            .delete(acquisitionProposalVersions)
            .where(inArray(acquisitionProposalVersions.proposalId, propIds));
          await db
            .delete(acquisitionProposals)
            .where(inArray(acquisitionProposals.id, propIds));
        }
      }

      // 2. Delete inventories
      if (createdInventoryIds.length > 0) {
        await db
          .delete(verifiedLandInventoryWorkflowHistory)
          .where(inArray(verifiedLandInventoryWorkflowHistory.inventoryId, createdInventoryIds));
        await db
          .delete(inventoryParcelSnapshots)
          .where(inArray(inventoryParcelSnapshots.inventoryId, createdInventoryIds));
        await db
          .delete(verifiedLandInventories)
          .where(inArray(verifiedLandInventories.id, createdInventoryIds));
      }

      // 3. Delete case parcels & parcels
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

      // 4. Delete cases
      if (createdCaseIds.length > 0) {
        await db
          .delete(acquisitionCases)
          .where(inArray(acquisitionCases.id, createdCaseIds));
      }

      // 5. Delete projects
      if (createdProjectIds.length > 0) {
        await db
          .delete(projects)
          .where(inArray(projects.id, createdProjectIds));
      }

      // 6. Delete users
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
    } finally {
      await client.end();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SETUP: CREATE PROPOSALS (VALID & INCOMPLETE/INVALID)
  // ──────────────────────────────────────────────────────────────────────────

  it('1. Creates a complete initial proposal with valid substantive content and supporting documents (201 Created)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Critical national rail freight corridor connecting inland multimodal logistics park.',
      publicPurpose: 'National transportation infrastructure development under Dedicated Freight Corridor scheme.',
      legalFramework: 'Right to Fair Compensation and Transparency in Land Acquisition Act, 2013',
      landRequirementExplanation: '60-meter right of way required for twin-track electrified freight line and buffer.',
      administrativeApprovalRef: 'RLY-BD-2026-4411',
      administrativeApprovalDate: '2026-02-20',
      supportingDocuments: [
        {
          documentType: 'Administrative Sanction',
          documentNumber: 'AS-RLY-2026-01',
          title: 'Railway Board Sanction Order',
          fileUrl: '/documents/railways/as-4411.pdf',
        },
        {
          documentType: 'Alignment Map',
          documentNumber: 'MAP-ALIGN-01',
          title: 'Approved Alignment Key Plan',
          fileUrl: '/documents/maps/align-01.pdf',
        },
      ],
    });

    const res = await createProposalHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    validProposalId = json.data.id;
  });

  it('2. Creates a proposal on the invalid-area case for testing area-level validation failure (201 Created)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: invalidAreaCaseId,
      linkedInventoryId: invalidAreaInventoryId,
      acquisitionJustification: 'Commercial land acquisition for railway yard expansion.',
      publicPurpose: 'Public railway infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Required for siding and shunting neck.',
      supportingDocuments: [
        {
          documentType: 'Feasibility Report',
          title: 'Preliminary Engineering Cum Traffic Survey',
          fileUrl: '/docs/survey.pdf',
        },
      ],
    });

    const res = await createProposalHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    invalidProposalId = json.data.id;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. RULE-BASED PROPOSAL VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  it('3. Complete valid proposal passes validation (overallResult: PASSED, hasBlockingErrors: false) (200 OK)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/validate`, projectOfficerCookie);
    const res = await validateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    const report = json.data;

    assert.equal(report.overallResult, 'PASSED', 'Complete proposal should pass validation');
    assert.equal(report.hasBlockingErrors, false, 'Complete proposal must have 0 blocking errors');
    assert.equal(report.summary.blockingErrors, 0);
    assert.ok(report.checks.length >= 10, 'Must run all rule-based checks across categories');

    // Verify checks across all 4 categories exist
    const categories = new Set(report.checks.map((c: { category: string }) => c.category));
    assert.ok(categories.has('COMPLETENESS'), 'Must include COMPLETENESS category');
    assert.ok(categories.has('INVENTORY_CONSISTENCY'), 'Must include INVENTORY_CONSISTENCY category');
    assert.ok(categories.has('AREA_AND_PARCEL'), 'Must include AREA_AND_PARCEL category');
    assert.ok(categories.has('DOCUMENTS'), 'Must include DOCUMENTS category');
  });

  it('4. Area inconsistency is detected: parcel affected area exceeding recorded area fails validation (FAILED, blocking) (200 OK)', async () => {
    assert.ok(invalidProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${invalidProposalId}/validate`, projectOfficerCookie);
    const res = await validateProposalHandler(req, { params: Promise.resolve({ id: invalidProposalId }) });

    assert.equal(res.status, 200);
    const json = await res.json();
    const report = json.data;

    assert.equal(report.overallResult, 'FAILED');
    assert.equal(report.hasBlockingErrors, true, 'Area exceeding recorded area must be blocking');

    const areaViolationCheck = report.checks.find(
      (c: { id: string }) => c.id === 'AREA-PARCEL-EXCEEDS-RECORDED'
    );
    assert.ok(areaViolationCheck, 'AREA-PARCEL-EXCEEDS-RECORDED check must be present');
    assert.equal(areaViolationCheck.status, 'FAILED');
    assert.equal(areaViolationCheck.isBlocking, true);
    assert.ok(areaViolationCheck.correctiveAction, 'Must provide actionable corrective guidance');
  });

  it('5. Missing required documents is detected as a blocking failure', async () => {
    // Temporarily clear documents on validProposal
    const [ver] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, validProposalId))
      .limit(1);

    await db
      .update(acquisitionProposalVersions)
      .set({ supportingDocuments: [] })
      .where(eq(acquisitionProposalVersions.id, ver.id));

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/validate`, projectOfficerCookie);
    const res = await validateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });
    const json = await res.json();
    const report = json.data;

    assert.equal(report.hasBlockingErrors, true);
    const docCheck = report.checks.find((c: { id: string }) => c.id === 'COMPL-SUPPORTING-DOCS');
    assert.ok(docCheck);
    assert.equal(docCheck.status, 'FAILED');
    assert.equal(docCheck.isBlocking, true);
    assert.ok(report.missingInformation.includes('Supporting Documents'));

    // Restore documents
    await db
      .update(acquisitionProposalVersions)
      .set({
        supportingDocuments: [
          {
            documentType: 'Administrative Sanction',
            documentNumber: 'AS-RLY-2026-01',
            title: 'Railway Board Sanction Order',
            fileUrl: '/documents/railways/as-4411.pdf',
          },
        ],
      })
      .where(eq(acquisitionProposalVersions.id, ver.id));
  });

  it('6. Missing or insufficient acquisition justification is detected as a blocking failure', async () => {
    const [ver] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, validProposalId))
      .limit(1);

    const originalJustification = ver.acquisitionJustification;

    // Set short/empty justification
    await db
      .update(acquisitionProposalVersions)
      .set({ acquisitionJustification: 'Too short' })
      .where(eq(acquisitionProposalVersions.id, ver.id));

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/validate`, projectOfficerCookie);
    const res = await validateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });
    const json = await res.json();
    const report = json.data;

    const justCheck = report.checks.find((c: { id: string }) => c.id === 'COMPL-JUSTIFICATION');
    assert.ok(justCheck);
    assert.equal(justCheck.status, 'FAILED');
    assert.equal(justCheck.isBlocking, true);

    // Restore original justification
    await db
      .update(acquisitionProposalVersions)
      .set({ acquisitionJustification: originalJustification })
      .where(eq(acquisitionProposalVersions.id, ver.id));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. PROPOSAL SUBMISSION WORKFLOW & IMMUTABILITY
  // ──────────────────────────────────────────────────────────────────────────

  it('7. Rejects proposal submission if blocking validation errors exist (400 Bad Request)', async () => {
    assert.ok(invalidProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${invalidProposalId}/submit`, projectOfficerCookie, {
      remarks: 'Attempting to submit invalid proposal with area violations.',
    });
    const res = await submitProposalHandler(req, { params: Promise.resolve({ id: invalidProposalId }) });

    assert.equal(res.status, 400, 'Must reject submission when validation errors exist');
    const json = await res.json();
    assert.ok(json.error.includes('blocking error'), 'Error must inform user about blocking validation errors');
  });

  it('8. Rejects submission by unauthorized Land Officer (403 Forbidden)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/submit`, landOfficerCookie);
    const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 403, 'Land Officer cannot submit acquisition proposals');
    const json = await res.json();
    assert.ok(json.error.includes('Implementing Agency'));
  });

  it('9. Rejects submission by out-of-scope agency officer (403 Forbidden)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/submit`, outOfScopeOfficerCookie);
    const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 403, 'Out-of-scope agency officer cannot submit proposal');
  });

  it('10. Authorized agency user successfully submits valid proposal (200 OK)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/submit`, projectOfficerCookie, {
      remarks: 'Formal transmittal for Ministry scrutiny under RFCTLARR Section 4.',
    });
    const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 200, 'Proposal submission must succeed');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.currentStatus, 'SUBMITTED', 'Proposal header status must transition to SUBMITTED');
    assert.equal(json.data.currentVersion.status, 'SUBMITTED', 'Version status must transition to SUBMITTED');
    assert.ok(json.data.currentVersion.submittedAt, 'Version must have submittedAt timestamp recorded');
    assert.equal(json.data.currentVersion.submittedBy, projectOfficerId, 'Version must record submitting user');

    // Verify audit entry in workflow history
    const auditSubmissions = json.data.workflowHistory.filter(
      (w: { action: string }) => w.action === 'SUBMIT'
    );
    assert.ok(auditSubmissions.length >= 1, 'SUBMIT action must be recorded in workflow history');
    assert.equal(auditSubmissions[0].toStatus, 'SUBMITTED');
    assert.equal(auditSubmissions[0].actorId, projectOfficerId);
  });

  it('11. Prevents duplicate submission of an already submitted proposal (400 Bad Request)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/submit`, projectOfficerCookie, {
      remarks: 'Second submission attempt.',
    });
    const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 400, 'Duplicate submission must be rejected');
    const json = await res.json();
    assert.ok(json.error.includes('SUBMITTED'), 'Error must indicate proposal is already submitted');
  });

  it('12. Submitted version is immutable: ordinary draft updates are rejected (400 Bad Request)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${validProposalId}`, projectOfficerCookie, {
      acquisitionJustification: 'Attempting to overwrite immutable submitted version.',
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 400, 'Must reject modifications to submitted version');
    const json = await res.json();
    assert.ok(json.error.includes('DRAFT'), 'Error must inform that only DRAFT proposals can be modified');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CORRECTION WORKFLOW & NEW VERSION MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  it('13. Rejects new version creation when proposal is NOT in CORRECTION_REQUESTED status (400 Bad Request)', async () => {
    assert.ok(validProposalId);
    // proposal is currently in SUBMITTED status
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/versions`, projectOfficerCookie, {
      remarks: 'Attempting to create version from SUBMITTED state.',
    });
    const res = await createProposalVersionHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 400, 'Cannot create new version when status is SUBMITTED');
    const json = await res.json();
    assert.ok(json.error.includes('CORRECTION_REQUESTED'));
  });

  it('14. Creates Version 2 when proposal is in CORRECTION_REQUESTED status ("Make Changes") (201 Created)', async () => {
    assert.ok(validProposalId);

    // Simulate Ministry Review outcome setting CORRECTION_REQUESTED
    await db
      .update(acquisitionProposals)
      .set({ currentStatus: 'CORRECTION_REQUESTED' })
      .where(eq(acquisitionProposals.id, validProposalId));

    // Record review remarks on Version 1
    const [v1] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, validProposalId))
      .limit(1);

    await db
      .update(acquisitionProposalVersions)
      .set({
        reviewedBy: ministryAdminId,
        reviewedAt: new Date(),
        reviewRemarks: 'Please update environmental clearance references and provide railway division consent.',
      })
      .where(eq(acquisitionProposalVersions.id, v1.id));

    // Agency Officer clicks "Make Changes" -> calls POST /versions
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/versions`, projectOfficerCookie, {
      remarks: 'Addressing Ministry review observations regarding environmental clearance.',
    });
    const res = await createProposalVersionHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 201, 'New version creation must succeed with 201 Created');
    const json = await res.json();
    assert.equal(json.success, true);

    // Verify Version 2 properties
    assert.equal(json.data.currentVersionNumber, 2, 'Proposal current version must now be 2');
    assert.equal(json.data.currentStatus, 'DRAFT', 'Proposal status must transition back to DRAFT for editing');
    assert.equal(json.data.currentVersion.versionNumber, 2);
    assert.equal(json.data.currentVersion.status, 'DRAFT');
    assert.equal(json.data.currentVersion.previousVersionId, v1.id, 'New version must link to Version 1');

    // Verify content was copied from Version 1
    assert.equal(
      json.data.currentVersion.acquisitionJustification,
      v1.acquisitionJustification,
      'Justification must be copied from previous version'
    );
    assert.equal(
      json.data.currentVersion.publicPurpose,
      v1.publicPurpose,
      'Public purpose must be copied from previous version'
    );
    assert.equal(
      json.data.currentVersion.legalFramework,
      v1.legalFramework,
      'Legal framework must be copied from previous version'
    );
    assert.ok(json.data.currentVersion.supportingDocuments?.length >= 1, 'Documents must be preserved');

    // Verify Version 1 remains unchanged in SUBMITTED state
    const [v1After] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.id, v1.id))
      .limit(1);
    assert.equal(v1After.versionNumber, 1);
    assert.equal(v1After.status, 'SUBMITTED', 'Version 1 must remain permanently in SUBMITTED status');
    assert.ok(v1After.submittedAt, 'Version 1 submission timestamp must remain preserved');
    assert.equal(v1After.reviewRemarks, 'Please update environmental clearance references and provide railway division consent.');

    // Verify CREATE_VERSION recorded in workflow history
    const versionHistoryEvents = json.data.workflowHistory.filter(
      (w: { action: string }) => w.action === 'CREATE_VERSION'
    );
    assert.ok(versionHistoryEvents.length >= 1);
    assert.equal(versionHistoryEvents[0].versionNumber, 2);
    assert.equal(versionHistoryEvents[0].fromStatus, 'CORRECTION_REQUESTED');
    assert.equal(versionHistoryEvents[0].toStatus, 'DRAFT');
  });

  it('15. Agency Officer can edit the new draft (Version 2) (200 OK)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${validProposalId}`, projectOfficerCookie, {
      acquisitionJustification:
        'Updated Rail freight corridor justification including Environmental Clearance EC-2026-88 and Railway Division concurrence.',
      administrativeApprovalRef: 'RLY-BD-2026-4411-REV2',
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 200, 'Draft update on Version 2 must succeed');
    const json = await res.json();
    assert.equal(json.data.currentVersionNumber, 2);
    assert.equal(
      json.data.currentVersion.acquisitionJustification,
      'Updated Rail freight corridor justification including Environmental Clearance EC-2026-88 and Railway Division concurrence.'
    );
    assert.equal(json.data.currentVersion.administrativeApprovalRef, 'RLY-BD-2026-4411-REV2');
  });

  it('16. Version 2 can be validated and resubmitted (200 OK)', async () => {
    assert.ok(validProposalId);

    // Validate Version 2
    const valReq = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/validate`, projectOfficerCookie);
    const valRes = await validateProposalHandler(valReq, { params: Promise.resolve({ id: validProposalId }) });
    assert.equal(valRes.status, 200);
    const valJson = await valRes.json();
    assert.equal(valJson.data.overallResult, 'PASSED');
    assert.equal(valJson.data.versionNumber, 2);

    // Submit Version 2 (Resubmission)
    const subReq = makeReq('POST', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/submit`, projectOfficerCookie, {
      remarks: 'Resubmitted Version 2 with updated environmental clearance details.',
    });
    const subRes = await submitProposalHandler(subReq, { params: Promise.resolve({ id: validProposalId }) });
    assert.equal(subRes.status, 200);
    const subJson = await subRes.json();

    assert.equal(subJson.data.currentStatus, 'SUBMITTED');
    assert.equal(subJson.data.currentVersion.versionNumber, 2);
    assert.equal(subJson.data.currentVersion.status, 'SUBMITTED');
    assert.ok(subJson.data.currentVersion.submittedAt);

    // Verify RESUBMIT action in audit history
    const resubmitAudit = subJson.data.workflowHistory.find(
      (w: { action: string }) => w.action === 'RESUBMIT'
    );
    assert.ok(resubmitAudit, 'Resubmission must record RESUBMIT action in audit trail');
    assert.equal(resubmitAudit.versionNumber, 2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. VERSION HISTORY & INDIVIDUAL VERSION RETRIEVAL
  // ──────────────────────────────────────────────────────────────────────────

  it('17. Retrieves complete version history for the proposal (200 OK)', async () => {
    assert.ok(validProposalId);
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-proposals/${validProposalId}/versions`, projectOfficerCookie);
    const res = await getProposalVersionsHandler(req, { params: Promise.resolve({ id: validProposalId }) });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 2, 'Proposal must have exactly 2 versions');

    const v2 = json.data.find((v: { versionNumber: number }) => v.versionNumber === 2);
    const v1 = json.data.find((v: { versionNumber: number }) => v.versionNumber === 1);
    assert.ok(v2);
    assert.ok(v1);

    assert.equal(v1.status, 'SUBMITTED');
    assert.equal(v2.status, 'SUBMITTED');
    assert.ok(v1.reviewRemarks);
    assert.ok(v1.submittedAt);
    assert.ok(v2.submittedAt);
  });

  it('18. Retrieves individual version detail and supporting documents (200 OK)', async () => {
    assert.ok(validProposalId);
    const [v1] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, validProposalId))
      .orderBy(acquisitionProposalVersions.versionNumber)
      .limit(1);

    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-proposals/${validProposalId}/versions/${v1.id}`,
      projectOfficerCookie
    );
    const res = await getProposalVersionDetailHandler(req, {
      params: Promise.resolve({ id: validProposalId, versionId: v1.id }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.id, v1.id);
    assert.equal(json.data.versionNumber, 1);
    assert.equal(json.data.status, 'SUBMITTED');
    assert.ok(json.data.creator.name);
    assert.ok(json.data.supportingDocuments?.length >= 1);
  });

  it('19. Listing includes version count and does not return duplicate rows for multiple versions', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie);
    const res = await (await import('../../src/app/api/acquisition-proposals/route')).GET(req);
    assert.equal(res.status, 200);
    const json = await res.json();

    const matching = json.data.filter((p: { id: string }) => p.id === validProposalId);
    assert.equal(matching.length, 1, 'Proposal must appear exactly once in listing (never duplicate per version)');
    assert.equal(matching[0].currentVersionNumber, 2);
    assert.equal(matching[0].versionCount, 2, 'Proposal listing must show correct version count of 2');
  });
});

