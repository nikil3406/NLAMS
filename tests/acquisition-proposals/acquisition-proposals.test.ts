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
import {
  POST as createProposalHandler,
  GET as listProposalsHandler,
} from '../../src/app/api/acquisition-proposals/route';
import {
  GET as getProposalHandler,
  PATCH as updateProposalHandler,
} from '../../src/app/api/acquisition-proposals/[id]/route';
import { GET as getEligibleCasesHandler } from '../../src/app/api/acquisition-proposals/eligible-cases/route';

describe('NLAMS – Step 1: Proposal Foundation & Preparation', () => {
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

  let inactiveAgencyUserId: string;
  let inactiveAgencyUserCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  let registeredProjectId: string;
  let draftProjectId: string;

  let eligibleCaseId: string;
  let caseWithDraftProjectId: string;
  let caseWithoutInventoryId: string;
  let otherCaseId: string;

  let approvedInventoryId: string;
  let draftInventoryId: string;
  let otherCaseApprovedInventoryId: string;

  let createdProposalId: string;

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

    // Primary Implementing Agency user (PROJECT_OFFICER in KA)
    projectOfficerId = await makeUser('KA Project Officer Creator', 'po.creator');
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
    secondProjectOfficerId = await makeUser('KA Project Officer Other', 'po.other');
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
    outOfScopeOfficerId = await makeUser('MH Project Officer', 'po.mh');
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

    // Inactive Agency User
    inactiveAgencyUserId = await makeUser('Inactive Officer', 'inact.po', 'INACTIVE');
    await db.insert(userRoles).values({
      userId: inactiveAgencyUserId,
      roleId: poRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: inactiveAgencyUserId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    inactiveAgencyUserCookie = await makeSession(inactiveAgencyUserId);

    // 5. Create Infrastructure Projects
    // Project 1: REGISTERED
    const [p1] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-REG-${ts}`,
        name: `Expressway Corridor ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: agencyId,
        administrativeUnitId: unitIdKA,
        status: 'REGISTERED',
        createdBy: projectOfficerId,
      })
      .returning({ id: projects.id });
    registeredProjectId = p1.id;
    createdProjectIds.push(registeredProjectId);

    // Project 2: DRAFT (ineligible for proposals)
    const [p2] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-DFT-${ts}`,
        name: `Draft Metro Link ${ts}`,
        projectType: 'Metro',
        implementingAgencyId: agencyId,
        administrativeUnitId: unitIdKA,
        status: 'DRAFT',
        createdBy: projectOfficerId,
      })
      .returning({ id: projects.id });
    draftProjectId = p2.id;
    createdProjectIds.push(draftProjectId);

    // 6. Create Acquisition Cases
    // Case 1: Eligible Case on Registered Project
    const [c1] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-ELIG-${ts}`,
        projectId: registeredProjectId,
        title: `Expressway Land Acquisition Sector 1 ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    eligibleCaseId = c1.id;
    createdCaseIds.push(eligibleCaseId);

    // Case 2: On DRAFT Project (ineligible)
    const [c2] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-DFT-${ts}`,
        projectId: draftProjectId,
        title: `Draft Project Acquisition ${ts}`,
        status: 'DRAFT',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    caseWithDraftProjectId = c2.id;
    createdCaseIds.push(caseWithDraftProjectId);

    // Case 3: On Registered Project but without any approved inventory
    const [c3] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-NOINV-${ts}`,
        projectId: registeredProjectId,
        title: `No Inventory Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    caseWithoutInventoryId = c3.id;
    createdCaseIds.push(caseWithoutInventoryId);

    // Case 4: Other case for testing mismatched inventory checks
    const [c4] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `ACQ-OTH-${ts}`,
        projectId: registeredProjectId,
        title: `Other Acquisition Case ${ts}`,
        status: 'FIELD_VERIFICATION_COMPLETED',
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    otherCaseId = c4.id;
    createdCaseIds.push(otherCaseId);

    // 7. Create Land Parcels for Case 1
    const [parcel1] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-1-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Bellandur',
        surveyNumber: `SY-101-${ts}`,
        totalArea: '5000.0000',
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
        proposedAffectedArea: '2500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp1.id);

    // 8. Create Verified Land Inventories
    // Inventory 1: APPROVED for Case 1 (Ministry-approved)
    const [inv1] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: eligibleCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '5000.0000',
        aggregateAffectedArea: '2500.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
        submittedBy: landOfficerId,
        submittedAt: new Date('2026-03-01T10:00:00Z'),
        reviewedBy: ministryAdminId,
        reviewedAt: new Date('2026-03-02T10:00:00Z'),
        reviewRemarks: 'Verified land inventory accepted and approved by Ministry',
      })
      .returning({ id: verifiedLandInventories.id });
    approvedInventoryId = inv1.id;
    createdInventoryIds.push(approvedInventoryId);

    // Inventory 2: DRAFT for Case 1 (not yet approved)
    const [inv2] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: eligibleCaseId,
        versionNumber: 2,
        status: 'DRAFT',
        totalParcelCount: 1,
        aggregateRecordedArea: '5000.0000',
        aggregateAffectedArea: '2500.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
        previousVersionId: approvedInventoryId,
      })
      .returning({ id: verifiedLandInventories.id });
    draftInventoryId = inv2.id;
    createdInventoryIds.push(draftInventoryId);

    // Inventory 3: APPROVED for Case 4 (other case)
    const [inv3] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: otherCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '3000.0000',
        aggregateAffectedArea: '1500.0000',
        areaUnit: 'SQ_M',
        preparedBy: landOfficerId,
        reviewedBy: ministryAdminId,
        reviewedAt: new Date('2026-03-02T10:00:00Z'),
      })
      .returning({ id: verifiedLandInventories.id });
    otherCaseApprovedInventoryId = inv3.id;
    createdInventoryIds.push(otherCaseApprovedInventoryId);
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

  // ──────────────────────────────────────────────────────────────────────────────
  // 1. AUTHORIZATION RULES & REJECTIONS
  // ──────────────────────────────────────────────────────────────────────────────

  it('1. Rejects proposal creation from unauthenticated requests (401 Unauthorized)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', undefined, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Valid justification for public highway corridor.',
      publicPurpose: 'National transportation infrastructure development.',
      legalFramework: 'Right to Fair Compensation and Transparency in Land Acquisition Act, 2013',
      landRequirementExplanation: 'Required for right-of-way width.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 401, 'Unauthenticated request must be rejected with 401');
  });

  it('2. Rejects proposal creation by Land Officer (403 Forbidden)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', landOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Land Officer tries to create proposal.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 403, 'Land Officer must be rejected from creating proposals');
    const json = await res.json();
    assert.ok(json.error.includes('Implementing Agency'), 'Error must specify Implementing Agency requirement');
  });

  it('3. Rejects proposal creation by Ministry Admin (403 Forbidden - no automatic ordinary privilege)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', ministryAdminCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Ministry Admin tries to create proposal directly.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 403, 'Ministry Admin must not automatically gain proposal creation privileges');
  });

  it('4. Rejects proposal creation by Super Admin without agency role (403 Forbidden)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', superAdminCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Super Admin tries to create proposal.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 403, 'Super Admin without agency role must not bypass proposal creation restriction');
  });

  it('5. Rejects proposal creation by out-of-scope Project Officer (403 Forbidden)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', outOfScopeOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Out of scope officer attempts creation.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 403, 'Out-of-scope agency officer must be rejected with 403');
  });

  it('6. Rejects proposal creation by inactive agency user (rejected by auth / authorization)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', inactiveAgencyUserCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Inactive user attempt.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.ok(
      res.status === 401 || res.status === 403,
      `Inactive agency user must be rejected (received ${res.status})`
    );
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 2. ELIGIBILITY & VALIDATION CHECKS
  // ──────────────────────────────────────────────────────────────────────────────

  it('7. Rejects proposal creation when linked inventory is not APPROVED (400 Bad Request)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: draftInventoryId, // DRAFT status inventory
      acquisitionJustification: 'Attempting with unapproved DRAFT inventory.',
      publicPurpose: 'Highway construction.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Required right of way.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 400, 'Must reject linking an unapproved inventory');
    const json = await res.json();
    assert.ok(json.error.includes('APPROVED'), 'Error must mention Ministry-approved status');
  });

  it('8. Rejects proposal creation when inventory belongs to a different acquisition case (400 Bad Request)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: otherCaseApprovedInventoryId, // Belongs to otherCaseId
      acquisitionJustification: 'Attempting with inventory from another case.',
      publicPurpose: 'Highway construction.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Required right of way.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 400, 'Must reject inventory belonging to a different case');
    const json = await res.json();
    assert.ok(json.error.includes('does not belong'), 'Error must explain inventory case mismatch');
  });

  it('9. Rejects proposal creation for case linked to non-REGISTERED project (400 Bad Request)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: caseWithDraftProjectId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Case on draft project.',
      publicPurpose: 'Transit development.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Required right of way.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 400, 'Must reject proposal for project in DRAFT status');
    const json = await res.json();
    assert.ok(json.error.includes('REGISTERED'), 'Error must explain project status requirement');
  });

  it('10. Rejects client-supplied forbidden fields (id, proposalNumber, currentStatus) (400 Bad Request)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Valid justification with client-injected status.',
      publicPurpose: 'Highway construction.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Required right of way.',
      currentStatus: 'APPROVED', // Forbidden client override
      proposalNumber: 'HACK-001',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 400, 'Client-injected status and proposalNumber must be rejected');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 3. SUCCESSFUL PROPOSAL CREATION (STEP 1 FOUNDATION & VERSION 1)
  // ──────────────────────────────────────────────────────────────────────────────

  it('11. Authorized Implementing Agency user creates proposal in DRAFT status with initial Version 1 (201 Created)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Critical national highway expansion connecting industrial hub to port.',
      publicPurpose: 'National transportation and freight corridor development under Bharatmala Pariyojana.',
      legalFramework: 'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013',
      landRequirementExplanation: '60-meter right of way required for 6-lane access-controlled highway.',
      administrativeApprovalRef: 'GO-MS-2026-9812',
      administrativeApprovalDate: '2026-02-15',
      supportingDocuments: [
        {
          documentType: 'Administrative Sanction',
          documentNumber: 'AS-2026-101',
          title: 'Government Sanction Order for Highway Sector 1',
          fileUrl: '/docs/sanctions/as-2026-101.pdf',
        },
      ],
    });

    const res = await createProposalHandler(req);
    assert.equal(res.status, 201, 'Proposal creation must succeed with 201 Created');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id, 'Proposal must have an ID');
    assert.ok(json.data.proposalNumber.startsWith('NLAMS-PROP-'), 'Proposal number must follow format NLAMS-PROP-XXXXXX');
    assert.equal(json.data.currentStatus, 'DRAFT', 'Initial proposal status must be DRAFT');
    assert.equal(json.data.currentVersionNumber, 1, 'Initial version number must be 1');
    assert.equal(json.data.acquisitionCaseId, eligibleCaseId);
    assert.equal(json.data.projectId, registeredProjectId);
    assert.equal(json.data.implementingAgencyId, agencyId);
    assert.equal(json.data.createdBy, projectOfficerId);
    assert.equal(json.data.linkedInventoryId, approvedInventoryId);

    // Verify Version 1 substantive content
    assert.ok(json.data.currentVersion, 'Current version must be returned');
    assert.equal(json.data.currentVersion.versionNumber, 1);
    assert.equal(json.data.currentVersion.status, 'DRAFT');
    assert.equal(json.data.currentVersion.acquisitionJustification, 'Critical national highway expansion connecting industrial hub to port.');
    assert.equal(json.data.currentVersion.publicPurpose, 'National transportation and freight corridor development under Bharatmala Pariyojana.');
    assert.equal(json.data.currentVersion.legalFramework, 'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013');
    assert.equal(json.data.currentVersion.landRequirementExplanation, '60-meter right of way required for 6-lane access-controlled highway.');
    assert.equal(json.data.currentVersion.administrativeApprovalRef, 'GO-MS-2026-9812');
    assert.ok(json.data.currentVersion.supportingDocuments?.length === 1);

    // Verify Audit workflow history
    assert.ok(json.data.workflowHistory?.length >= 1);
    assert.equal(json.data.workflowHistory[0].action, 'CREATE_DRAFT');
    assert.equal(json.data.workflowHistory[0].toStatus, 'DRAFT');

    createdProposalId = json.data.id;
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 4. DUPLICATE PREVENTION & DATABASE CONSTRAINTS
  // ──────────────────────────────────────────────────────────────────────────────

  it('12. Rejects second proposal creation for the same acquisition case (409 Conflict)', async () => {
    const req = makeReq('POST', 'http://localhost:3000/api/acquisition-proposals', projectOfficerCookie, {
      acquisitionCaseId: eligibleCaseId,
      linkedInventoryId: approvedInventoryId,
      acquisitionJustification: 'Attempting duplicate proposal for the same case.',
      publicPurpose: 'Public infrastructure.',
      legalFramework: 'RFCTLARR Act 2013',
      landRequirementExplanation: 'Requirement explanation.',
    });
    const res = await createProposalHandler(req);
    assert.equal(res.status, 409, 'Must prevent duplicate proposal for the same acquisition case with 409 Conflict');
    const json = await res.json();
    assert.ok(json.error.includes('already exists'), 'Error must inform user proposal already exists');
  });

  it('13. Enforces database-level unique constraint on acquisition_case_id', async () => {
    let dbErrorOccurred = false;
    try {
      await db.insert(acquisitionProposals).values({
        proposalNumber: `NLAMS-PROP-DUP-${ts}`,
        acquisitionCaseId: eligibleCaseId, // Duplicate caseId
        projectId: registeredProjectId,
        implementingAgencyId: agencyId,
        createdBy: projectOfficerId,
        linkedInventoryId: approvedInventoryId,
        linkedInventoryVersionId: approvedInventoryId,
        currentVersionNumber: 1,
        currentStatus: 'DRAFT',
      });
    } catch {
      dbErrorOccurred = true;
    }
    assert.equal(dbErrorOccurred, true, 'Database unique constraint must reject duplicate acquisition_case_id');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 5. PROPOSAL RETRIEVAL & LISTING
  // ──────────────────────────────────────────────────────────────────────────────

  it('14. Retrieves proposal details with current editable version and approved inventory summary (200 OK)', async () => {
    assert.ok(createdProposalId, 'Created proposal must exist');
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, projectOfficerCookie);
    const res = await getProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.id, createdProposalId);
    assert.equal(json.data.currentVersionNumber, 1);
    assert.equal(json.data.linkedInventory.id, approvedInventoryId);
    assert.equal(json.data.linkedInventory.status, 'APPROVED');
    assert.equal(json.data.linkedInventory.totalParcelCount, 1);
    assert.equal(json.data.project.name, `Expressway Corridor ${ts}`);
    assert.equal(json.data.acquisitionCase.title, `Expressway Land Acquisition Sector 1 ${ts}`);
  });

  it('15. Rejects out-of-scope user from viewing proposal details (403 Forbidden)', async () => {
    assert.ok(createdProposalId);
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, outOfScopeOfficerCookie);
    const res = await getProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 403, 'Out of scope user must be forbidden from accessing proposal details');
  });

  it('16. Lists proposals: returns one record per proposal (never duplicate per version) (200 OK)', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/acquisition-proposals?limit=20', projectOfficerCookie);
    const res = await listProposalsHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();

    const matching = json.data.filter((p: { id: string }) => p.id === createdProposalId);
    assert.equal(matching.length, 1, 'Proposal must appear exactly once in the listing');
    assert.equal(matching[0].currentVersionNumber, 1);
    assert.equal(matching[0].currentStatus, 'DRAFT');
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 6. DRAFT UPDATES & RESTRICTIONS
  // ──────────────────────────────────────────────────────────────────────────────

  it('17. Original creator can update their DRAFT proposal (200 OK)', async () => {
    assert.ok(createdProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, projectOfficerCookie, {
      acquisitionJustification: 'Updated justification with refined environmental clearance details.',
      landRequirementExplanation: 'Updated explanation: 60-meter ROW optimized to minimize impact on wet agricultural land.',
      administrativeApprovalRef: 'GO-MS-2026-9812-REV1',
    });

    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 200, 'Creator should be able to update their draft');
    const json = await res.json();

    assert.equal(json.data.currentVersion.acquisitionJustification, 'Updated justification with refined environmental clearance details.');
    assert.equal(json.data.currentVersion.landRequirementExplanation, 'Updated explanation: 60-meter ROW optimized to minimize impact on wet agricultural land.');
    assert.equal(json.data.currentVersion.administrativeApprovalRef, 'GO-MS-2026-9812-REV1');

    // Verify audit record appended
    const auditUpdates = json.data.workflowHistory.filter((w: { action: string }) => w.action === 'UPDATE_DRAFT');
    assert.ok(auditUpdates.length >= 1, 'UPDATE_DRAFT workflow audit event must be recorded');
  });

  it('18. Non-creator (second Project Officer) cannot edit another officer draft proposal (403 Forbidden)', async () => {
    assert.ok(createdProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, secondProjectOfficerCookie, {
      acquisitionJustification: 'Unauthorized modification attempt.',
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 403, 'Non-creator agency user must be rejected from modifying draft');
    const json = await res.json();
    assert.ok(json.error.includes('original creator'), 'Error must state only original creator may edit draft');
  });

  it('19. Ministry Admin cannot edit draft proposal (403 Forbidden)', async () => {
    assert.ok(createdProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, ministryAdminCookie, {
      acquisitionJustification: 'Ministry Admin attempts to modify draft.',
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 403, 'Ministry Admin cannot edit an agency draft proposal');
  });

  it('20. Rejects modification of acquisitionCaseId or linkedInventoryId via draft update (400 Bad Request)', async () => {
    assert.ok(createdProposalId);
    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, projectOfficerCookie, {
      acquisitionCaseId: otherCaseId, // Attempting to switch case
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 400, 'Switching acquisition case in draft update must be rejected');
  });

  it('21. Rejects draft updates once proposal is no longer in DRAFT status', async () => {
    assert.ok(createdProposalId);

    // Simulate future workflow state transition (e.g. SUBMITTED)
    await db
      .update(acquisitionProposals)
      .set({ currentStatus: 'SUBMITTED' })
      .where(eq(acquisitionProposals.id, createdProposalId));

    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-proposals/${createdProposalId}`, projectOfficerCookie, {
      acquisitionJustification: 'Editing a submitted proposal should fail.',
    });
    const res = await updateProposalHandler(req, { params: Promise.resolve({ id: createdProposalId }) });
    assert.equal(res.status, 400, 'Non-DRAFT proposal must reject edits');
    const json = await res.json();
    assert.ok(json.error.includes('DRAFT'), 'Error must state only DRAFT status can be modified');

    // Revert back to DRAFT for cleanup
    await db
      .update(acquisitionProposals)
      .set({ currentStatus: 'DRAFT' })
      .where(eq(acquisitionProposals.id, createdProposalId));
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 7. ELIGIBLE CASES API
  // ──────────────────────────────────────────────────────────────────────────────

  it('22. Eligible cases API excludes cases that already have a proposal', async () => {
    const req = makeReq('GET', 'http://localhost:3000/api/acquisition-proposals/eligible-cases', projectOfficerCookie);
    const res = await getEligibleCasesHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();

    const found = json.data.find((c: { id: string }) => c.id === eligibleCaseId);
    assert.equal(found, undefined, 'eligibleCaseId already has a proposal and must NOT be in eligible list');
  });
});
