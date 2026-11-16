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
} from '../../db/schema/verified-land-inventories';
import {
  acquisitionProposals,
  acquisitionProposalVersions,
  acquisitionProposalWorkflowHistory,
} from '../../db/schema/acquisition-proposals';
import {
  competentAuthorities,
  authorityJurisdictions,
  authorityUserAssignments,
  proposalAuthorityAssignments,
} from '../../db/schema/competent-authorities';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Services
import { competentAuthorityService } from '../../src/services/competent-authorities/competent-authority.service';
import { acquisitionProposalService } from '../../src/services/acquisition-proposals/acquisition-proposal.service';

// Route Handlers
import {
  GET as listAuthoritiesHandler,
  POST as createAuthorityHandler,
} from '../../src/app/api/competent-authorities/route';
import {
  GET as getAuthorityHandler,
  PATCH as updateAuthorityHandler,
} from '../../src/app/api/competent-authorities/[id]/route';
import {
  GET as listJurisdictionsHandler,
  POST as addJurisdictionHandler,
} from '../../src/app/api/competent-authorities/[id]/jurisdictions/route';
import { PATCH as updateJurisdictionHandler } from '../../src/app/api/competent-authorities/[id]/jurisdictions/[jurisdictionId]/route';
import {
  GET as listAuthorityUsersHandler,
  POST as assignAuthorityUserHandler,
} from '../../src/app/api/competent-authorities/[id]/users/route';
import { GET as getEligibleAuthoritiesHandler } from '../../src/app/api/competent-authorities/eligible/route';
import { GET as getProposalEligibleAuthoritiesHandler } from '../../src/app/api/acquisition-proposals/[id]/eligible-authorities/route';

describe('NLAMS – Step 3A: Competent Authority Foundation', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let projectOfficerId: string;
  let projectOfficerCookie: string;

  let authorityUserId: string;

  // Administrative Units
  let stateUnitId: string; // KA
  let districtUnitId1: string; // KA-BLR
  let districtUnitId2: string; // KA-MYS
  let otherStateUnitId: string; // MH

  // Implementing Agency & Project
  let agencyId: string;
  let projectId: string;

  // Cases & Inventories
  let singleDistrictCaseId: string;
  let singleDistrictInventoryId: string;

  let multiDistrictCaseId: string;
  let multiDistrictInventoryId: string;

  // Created test authorities
  let createdAuthorityIds: string[] = [];
  let createdProposalIds: string[] = [];

  before(async () => {
    try {
      // 1. Resolve administrative units
    const [ka] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    const [blr] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA-BLR'))
      .limit(1);
    const [mys] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA-MYS'))
      .limit(1);
    const [mh] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'MH'))
      .limit(1);

    assert.ok(ka && blr && mys && mh, 'Required administrative units must exist in DB');
    stateUnitId = ka.id;
    districtUnitId1 = blr.id;
    districtUnitId2 = mys.id;
    otherStateUnitId = mh.id;

    // 2. Fetch roles
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

    // 3. Create test users
    const pwdHash = await passwordService.hashPassword('Pass@1234');

    // Super Admin
    const [sa] = await db
      .insert(users)
      .values({
        email: `sa-ca-${ts}@nlams.test`,
        passwordHash: pwdHash,
        name: `Super Admin CA ${ts}`,
        status: 'ACTIVE',
      })
      .returning();
    superAdminId = sa.id;
    await db.insert(userRoles).values({
      userId: sa.id,
      roleId: roleMap.get('SUPER_ADMIN')!,
      assignedBy: sa.id,
    });
    const saSession = await sessionService.createSession(sa.id);
    superAdminCookie = `${authConfig.cookieName}=${saSession.token}`;

    // Ministry Admin
    const [ma] = await db
      .insert(users)
      .values({
        email: `ma-ca-${ts}@nlams.test`,
        passwordHash: pwdHash,
        name: `Ministry Admin CA ${ts}`,
        status: 'ACTIVE',
      })
      .returning();
    ministryAdminId = ma.id;
    await db.insert(userRoles).values({
      userId: ma.id,
      roleId: roleMap.get('MINISTRY_ADMIN')!,
      assignedBy: sa.id,
    });
    const maSession = await sessionService.createSession(ma.id);
    ministryAdminCookie = `${authConfig.cookieName}=${maSession.token}`;

    // Project Officer (Implementing Agency)
    const [po] = await db
      .insert(users)
      .values({
        email: `po-ca-${ts}@nlams.test`,
        passwordHash: pwdHash,
        name: `Project Officer CA ${ts}`,
        status: 'ACTIVE',
      })
      .returning();
    projectOfficerId = po.id;
    await db.insert(userRoles).values({
      userId: po.id,
      roleId: roleMap.get('PROJECT_OFFICER')!,
      assignedBy: sa.id,
    });
    await db.insert(userAssignments).values({
      userId: po.id,
      administrativeUnitId: stateUnitId,
      assignedBy: sa.id,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const poSession = await sessionService.createSession(po.id);
    projectOfficerCookie = `${authConfig.cookieName}=${poSession.token}`;

    // Authority User (to be assigned to Competent Authority)
    const [au] = await db
      .insert(users)
      .values({
        email: `auth-user-${ts}@nlams.test`,
        passwordHash: pwdHash,
        name: `Designated Authority User ${ts}`,
        status: 'ACTIVE',
      })
      .returning();
    authorityUserId = au.id;

    // 4. Reuse existing Implementing Agency & Create Project
    const [agency] = await db.select().from(implementingAgencies).limit(1);
    agencyId = agency.id;

    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-CA-${ts}`,
        name: `High-Speed Transit CA ${ts}`,
        projectType: 'INFRASTRUCTURE',
        status: 'REGISTERED',
        administrativeUnitId: stateUnitId,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning();
    projectId = proj.id;

    // 5. Setup Single-District Acquisition Case & Approved Inventory
    const [singleCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-CA-SGL-${ts}`,
        title: `Single-District Acquisition Case ${ts}`,
        projectId: projectId,
        status: 'APPROVED',
        createdBy: projectOfficerId,
        updatedBy: projectOfficerId,
      })
      .returning();
    singleDistrictCaseId = singleCase.id;

    // Parcel in BLR
    const [parcelBLR] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-BLR-${ts}`,
        administrativeUnitId: districtUnitId1,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: '101/A',
        totalArea: '5000.0000',
        areaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    const [caseParcelBLR] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: singleDistrictCaseId,
        parcelId: parcelBLR.id,
        proposedAffectedArea: '2500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    const [singleInv] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: singleDistrictCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '5000.0000',
        aggregateAffectedArea: '2500.0000',
        areaUnit: 'SQ_M',
        preparedBy: projectOfficerId,
        submittedBy: projectOfficerId,
        reviewedBy: superAdminId,
        reviewedAt: new Date(),
      })
      .returning();
    singleDistrictInventoryId = singleInv.id;

    await db.insert(inventoryParcelSnapshots).values({
      inventoryId: singleDistrictInventoryId,
      parcelId: parcelBLR.id,
      caseParcelId: caseParcelBLR.id,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: '101/A',
      recordedArea: '5000.0000',
      recordedAreaUnit: 'SQ_M',
      proposedAffectedArea: '2500.0000',
      proposedAffectedAreaUnit: 'SQ_M',
    });

    // 6. Setup Multi-District Acquisition Case & Approved Inventory (spans BLR and MYS)
    const [multiCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-CA-MULTI-${ts}`,
        title: `Multi-District Acquisition Case ${ts}`,
        projectId: projectId,
        status: 'APPROVED',
        createdBy: projectOfficerId,
        updatedBy: projectOfficerId,
      })
      .returning();
    multiDistrictCaseId = multiCase.id;

    // Parcel in MYS
    const [parcelMYS] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-MYS-${ts}`,
        administrativeUnitId: districtUnitId2,
        state: 'Karnataka',
        district: 'Mysuru',
        taluk: 'Mysuru Taluk',
        village: 'Chamundi',
        surveyNumber: '202/B',
        totalArea: '8000.0000',
        areaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    const [caseParcelMYS] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: multiDistrictCaseId,
        parcelId: parcelMYS.id,
        proposedAffectedArea: '4000.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    const [caseParcelBLR2] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: multiDistrictCaseId,
        parcelId: parcelBLR.id,
        proposedAffectedArea: '2000.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    const [multiInv] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: multiDistrictCaseId,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 2,
        aggregateRecordedArea: '13000.0000',
        aggregateAffectedArea: '6000.0000',
        areaUnit: 'SQ_M',
        preparedBy: projectOfficerId,
        submittedBy: projectOfficerId,
        reviewedBy: superAdminId,
        reviewedAt: new Date(),
      })
      .returning();
    multiDistrictInventoryId = multiInv.id;

    await db.insert(inventoryParcelSnapshots).values([
      {
        inventoryId: multiDistrictInventoryId,
        parcelId: parcelBLR.id,
        caseParcelId: caseParcelBLR2.id,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: '101/A',
        recordedArea: '5000.0000',
        recordedAreaUnit: 'SQ_M',
        proposedAffectedArea: '2000.0000',
        proposedAffectedAreaUnit: 'SQ_M',
      },
      {
        inventoryId: multiDistrictInventoryId,
        parcelId: parcelMYS.id,
        caseParcelId: caseParcelMYS.id,
        state: 'Karnataka',
        district: 'Mysuru',
        taluk: 'Mysuru Taluk',
        village: 'Chamundi',
        surveyNumber: '202/B',
        recordedArea: '8000.0000',
        recordedAreaUnit: 'SQ_M',
        proposedAffectedArea: '4000.0000',
        proposedAffectedAreaUnit: 'SQ_M',
      },
    ]);
    } catch (err) {
      console.error('ERROR IN BEFORE HOOK:', err);
      throw err;
    }
  });

  after(async () => {
    // Clean up created test data in reverse foreign-key order
    if (createdProposalIds.length > 0) {
      await db
        .delete(proposalAuthorityAssignments)
        .where(inArray(proposalAuthorityAssignments.proposalId, createdProposalIds));
      await db
        .delete(acquisitionProposalWorkflowHistory)
        .where(inArray(acquisitionProposalWorkflowHistory.proposalId, createdProposalIds));
      await db
        .delete(acquisitionProposalVersions)
        .where(inArray(acquisitionProposalVersions.proposalId, createdProposalIds));
      await db
        .delete(acquisitionProposals)
        .where(inArray(acquisitionProposals.id, createdProposalIds));
    }

    if (createdAuthorityIds.length > 0) {
      await db
        .delete(authorityUserAssignments)
        .where(inArray(authorityUserAssignments.authorityId, createdAuthorityIds));
      await db
        .delete(authorityJurisdictions)
        .where(inArray(authorityJurisdictions.authorityId, createdAuthorityIds));
      await db
        .delete(competentAuthorities)
        .where(inArray(competentAuthorities.id, createdAuthorityIds));
    }

    // Clean up inventories, parcels, cases, projects
    await db
      .delete(inventoryParcelSnapshots)
      .where(
        inArray(inventoryParcelSnapshots.inventoryId, [
          singleDistrictInventoryId,
          multiDistrictInventoryId,
        ])
      );
    await db
      .delete(verifiedLandInventories)
      .where(
        inArray(verifiedLandInventories.id, [
          singleDistrictInventoryId,
          multiDistrictInventoryId,
        ])
      );
    await db
      .delete(acquisitionCaseParcels)
      .where(
        inArray(acquisitionCaseParcels.caseId, [
          singleDistrictCaseId,
          multiDistrictCaseId,
        ])
      );
    await db
      .delete(acquisitionCases)
      .where(
        inArray(acquisitionCases.id, [
          singleDistrictCaseId,
          multiDistrictCaseId,
        ])
      );
    await db.delete(projects).where(eq(projects.id, projectId));
    // Note: agencyId refers to an existing agency that we reused - do NOT delete it

    // Delete land parcels created for test
    await db
      .delete(landParcels)
      .where(inArray(landParcels.createdBy, [projectOfficerId]));

    // Clean up users
    await db
      .delete(userAssignments)
      .where(eq(userAssignments.userId, projectOfficerId));
    await db
      .delete(userRoles)
      .where(
        inArray(userRoles.userId, [
          superAdminId,
          ministryAdminId,
          projectOfficerId,
          authorityUserId,
        ])
      );
    await db
      .delete(users)
      .where(
        inArray(users.id, [
          superAdminId,
          ministryAdminId,
          projectOfficerId,
          authorityUserId,
        ])
      );

    await client.end();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. COMPETENT AUTHORITY CONFIGURATION & CRUD
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Competent Authority Configuration & CRUD', () => {
    let createdAuthId: string;

    it('1.1 Super Admin can create a Competent Authority record', async () => {
      const code = `CA-DC-BLR-${ts}`;
      const req = new NextRequest('http://localhost/api/competent-authorities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superAdminCookie,
        },
        body: JSON.stringify({
          authorityCode: code,
          authorityName: `Deputy Commissioner Bengaluru ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        }),
      });

      const res = await createAuthorityHandler(req);
      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.authorityCode, code);
      assert.strictEqual(json.data.designation, 'District Collector');
      assert.strictEqual(json.data.authorityLevel, 'DISTRICT');

      createdAuthId = json.data.id;
      createdAuthorityIds.push(createdAuthId);
    });

    it('1.2 Rejects duplicate authorityCode with 409 Conflict', async () => {
      const req = new NextRequest('http://localhost/api/competent-authorities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superAdminCookie,
        },
        body: JSON.stringify({
          authorityCode: `CA-DC-BLR-${ts}`, // Duplicate code
          authorityName: `Duplicate DC ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          effectiveFrom: '2026-01-01',
        }),
      });

      const res = await createAuthorityHandler(req);
      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error, /already exists/i);
    });

    it('1.3 Forbids non-admin (Implementing Agency) user from creating authorities', async () => {
      const req = new NextRequest('http://localhost/api/competent-authorities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: projectOfficerCookie,
        },
        body: JSON.stringify({
          authorityCode: `CA-PO-FORBID-${ts}`,
          authorityName: 'Unauthorized Authority',
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          effectiveFrom: '2026-01-01',
        }),
      });

      const res = await createAuthorityHandler(req);
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error, /Only Super Admin or Ministry Admin/i);
    });

    it('1.4 Retrieves authority details with jurisdictions and user assignments', async () => {
      const req = new NextRequest(`http://localhost/api/competent-authorities/${createdAuthId}`, {
        method: 'GET',
        headers: { Cookie: superAdminCookie },
      });

      const res = await getAuthorityHandler(req, {
        params: Promise.resolve({ id: createdAuthId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.id, createdAuthId);
      assert.ok(Array.isArray(json.data.jurisdictions));
      assert.ok(Array.isArray(json.data.userAssignments));
    });

    it('1.5 Updates authority details (designation, status, dates)', async () => {
      const req = new NextRequest(`http://localhost/api/competent-authorities/${createdAuthId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superAdminCookie,
        },
        body: JSON.stringify({
          designation: 'Special Deputy Collector (Land Acquisition)',
          effectiveUntil: '2028-12-31',
        }),
      });

      const res = await updateAuthorityHandler(req, {
        params: Promise.resolve({ id: createdAuthId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.designation, 'Special Deputy Collector (Land Acquisition)');
      assert.strictEqual(json.data.effectiveUntil, '2028-12-31');
    });

    it('1.6 Lists authorities with filtering', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities?level=DISTRICT&status=ACTIVE&search=CA-DC-BLR`,
        {
          method: 'GET',
          headers: { Cookie: superAdminCookie },
        }
      );

      const res = await listAuthoritiesHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.length >= 1);
      assert.strictEqual(json.data[0].id, createdAuthId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. JURISDICTION MANAGEMENT & HIERARCHY VALIDATION
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Jurisdiction Management & Hierarchy Validation', () => {
    let authId: string;
    let createdJurisdictionId: string;

    before(async () => {
      const auth = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-JUR-TEST-${ts}`,
          authorityName: `Jurisdiction Test Authority ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      authId = auth.id;
      createdAuthorityIds.push(authId);
    });

    it('2.1 Rejects jurisdiction with invalid administrative unit hierarchy', async () => {
      // Trying to attach a Maharashtra administrative unit as district under Karnataka state
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/jurisdictions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: superAdminCookie,
          },
          body: JSON.stringify({
            stateId: stateUnitId, // Karnataka
            districtId: otherStateUnitId, // Maharashtra (type STATE, not DISTRICT, and parent not KA)
            effectiveFrom: '2026-01-01',
          }),
        }
      );

      const res = await addJurisdictionHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error, /expected 'DISTRICT'|does not belong to state/i);
    });

    it('2.2 Adds valid district-level jurisdiction', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/jurisdictions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: superAdminCookie,
          },
          body: JSON.stringify({
            stateId: stateUnitId,
            districtId: districtUnitId1, // Bengaluru Urban
            effectiveFrom: '2026-01-01',
            status: 'ACTIVE',
          }),
        }
      );

      const res = await addJurisdictionHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.stateId, stateUnitId);
      assert.strictEqual(json.data.districtId, districtUnitId1);
      assert.strictEqual(json.data.status, 'ACTIVE');

      createdJurisdictionId = json.data.id;
    });

    it('2.3 Updates jurisdiction status to INACTIVE', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/jurisdictions/${createdJurisdictionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: superAdminCookie,
          },
          body: JSON.stringify({
            status: 'INACTIVE',
          }),
        }
      );

      const res = await updateJurisdictionHandler(req, {
        params: Promise.resolve({ id: authId, jurisdictionId: createdJurisdictionId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'INACTIVE');
    });

    it('2.4 Lists jurisdictions for an authority', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/jurisdictions`,
        {
          method: 'GET',
          headers: { Cookie: superAdminCookie },
        }
      );

      const res = await listJurisdictionsHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].id, createdJurisdictionId);
      assert.strictEqual(json.data[0].state.name, 'Karnataka');
      assert.strictEqual(json.data[0].district.name, 'Bengaluru Urban');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. USER ASSIGNMENT MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. User Assignment Management', () => {
    let authId: string;
    let assignmentId: string;

    before(async () => {
      const auth = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-USR-TEST-${ts}`,
          authorityName: `User Assignment Test Authority ${ts}`,
          designation: 'Divisional Commissioner',
          authorityLevel: 'REGIONAL',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      authId = auth.id;
      createdAuthorityIds.push(authId);
    });

    it('3.1 Assigns an active user to a Competent Authority', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: superAdminCookie,
          },
          body: JSON.stringify({
            userId: authorityUserId,
            effectiveFrom: '2026-01-01',
            status: 'ACTIVE',
          }),
        }
      );

      const res = await assignAuthorityUserHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.userId, authorityUserId);
      assert.strictEqual(json.data.status, 'ACTIVE');

      assignmentId = json.data.id;
    });

    it('3.2 Rejects duplicate active assignment for the same user and authority with 409 Conflict', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: superAdminCookie,
          },
          body: JSON.stringify({
            userId: authorityUserId,
            effectiveFrom: '2026-01-01',
          }),
        }
      );

      const res = await assignAuthorityUserHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error, /already has an active assignment/i);
    });

    it('3.3 Lists assigned users for the authority', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/${authId}/users`,
        {
          method: 'GET',
          headers: { Cookie: superAdminCookie },
        }
      );

      const res = await listAuthorityUsersHandler(req, {
        params: Promise.resolve({ id: authId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].id, assignmentId);
      assert.strictEqual(json.data[0].user.id, authorityUserId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. JURISDICTION-BASED AUTHORITY DISCOVERY (OPTION A: COMMON HIGHER AUTHORITY)
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Jurisdiction-Based Authority Discovery (Option A: Common Higher Authority)', () => {
    let dcBangaloreId: string;
    let dcMysoreId: string;
    let divCommBangaloreId: string;
    let stateAuthorityId: string;

    before(async () => {
      // 1. District Collector Bengaluru Urban (Level: DISTRICT, jurisdiction: KA-BLR)
      const dcBlr = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-DC-BLR-DISC-${ts}`,
          authorityName: `DC Bengaluru Urban ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      dcBangaloreId = dcBlr.id;
      createdAuthorityIds.push(dcBangaloreId);

      await competentAuthorityService.addJurisdiction(
        dcBangaloreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId1, // BLR
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );

      // 2. District Collector Mysuru (Level: DISTRICT, jurisdiction: KA-MYS)
      const dcMys = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-DC-MYS-DISC-${ts}`,
          authorityName: `DC Mysuru ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      dcMysoreId = dcMys.id;
      createdAuthorityIds.push(dcMysoreId);

      await competentAuthorityService.addJurisdiction(
        dcMysoreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId2, // MYS
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );

      // 3. Regional / Divisional Commissioner (Level: REGIONAL, jurisdiction covers BLR & MYS)
      const divComm = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-DIVCOMM-DISC-${ts}`,
          authorityName: `Divisional Commissioner Southern Range ${ts}`,
          designation: 'Divisional Commissioner',
          authorityLevel: 'REGIONAL',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      divCommBangaloreId = divComm.id;
      createdAuthorityIds.push(divCommBangaloreId);

      await competentAuthorityService.addJurisdiction(
        divCommBangaloreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId1,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );
      await competentAuthorityService.addJurisdiction(
        divCommBangaloreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId2,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );

      // 4. State-Level Authority (Level: STATE, jurisdiction covers entire Karnataka)
      const stateAuth = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-STATE-DISC-${ts}`,
          authorityName: `Karnataka Land Acquisition Appellate Authority ${ts}`,
          designation: 'Designated State Government Authority',
          authorityLevel: 'STATE',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      stateAuthorityId = stateAuth.id;
      createdAuthorityIds.push(stateAuthorityId);

      await competentAuthorityService.addJurisdiction(
        stateAuthorityId,
        {
          stateId: stateUnitId, // covers whole state (districtId is null)
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );
    });

    it('4.1 Single-District Case: Eligible authorities include District DC, Regional DivComm, and State Authority', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/eligible?caseId=${singleDistrictCaseId}`,
        {
          method: 'GET',
          headers: { Cookie: projectOfficerCookie },
        }
      );

      const res = await getEligibleAuthoritiesHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.isMultiDistrict, false);
      assert.strictEqual(json.totalParcels, 1);
      assert.strictEqual(json.notice, null);

      const eligibleIds = json.data.map((a: any) => a.id);
      // DC Bangalore covers BLR -> ELIGIBLE
      assert.ok(eligibleIds.includes(dcBangaloreId), 'DC Bengaluru must be eligible for single district case');
      // DivComm covers BLR & MYS -> ELIGIBLE
      assert.ok(eligibleIds.includes(divCommBangaloreId), 'DivComm must be eligible');
      // State Authority covers all KA -> ELIGIBLE
      assert.ok(eligibleIds.includes(stateAuthorityId), 'State Authority must be eligible');
      // DC Mysuru covers only MYS -> INELIGIBLE
      assert.ok(!eligibleIds.includes(dcMysoreId), 'DC Mysuru must NOT be eligible for BLR parcels');
    });

    it('4.2 Multi-District Case: Option A strictly excludes district-level authorities and only selects common higher authority', async () => {
      const req = new NextRequest(
        `http://localhost/api/competent-authorities/eligible?caseId=${multiDistrictCaseId}`,
        {
          method: 'GET',
          headers: { Cookie: projectOfficerCookie },
        }
      );

      const res = await getEligibleAuthoritiesHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.isMultiDistrict, true);
      assert.strictEqual(json.totalParcels, 2);
      assert.strictEqual(json.affectedDistricts.length, 2);

      const eligibleIds = json.data.map((a: any) => a.id);
      // DC Bengaluru is DISTRICT level and covers only 1 district -> STRICTLY INELIGIBLE
      assert.ok(!eligibleIds.includes(dcBangaloreId), 'DC Bengaluru must NOT be eligible for multi-district case');
      // DC Mysuru is DISTRICT level and covers only 1 district -> STRICTLY INELIGIBLE
      assert.ok(!eligibleIds.includes(dcMysoreId), 'DC Mysuru must NOT be eligible for multi-district case');

      // Common higher authorities covering both districts:
      // DivComm is REGIONAL level and covers both BLR & MYS -> ELIGIBLE
      assert.ok(eligibleIds.includes(divCommBangaloreId), 'DivComm encompassing both districts must be eligible');
      // State Authority is STATE level and covers all Karnataka -> ELIGIBLE
      assert.ok(eligibleIds.includes(stateAuthorityId), 'State Authority encompassing all districts must be eligible');
    });

    it('4.3 Uncovered Multi-District Case: Returns empty list with administrative resolution notice', async () => {
      // Temporarily deactivate active jurisdictions to test uncovered multi-district scenario
      const activeJurs = await db
        .select({ id: authorityJurisdictions.id })
        .from(authorityJurisdictions)
        .where(eq(authorityJurisdictions.status, 'ACTIVE'));
      const activeJurIds = activeJurs.map((j) => j.id);

      if (activeJurIds.length > 0) {
        await db
          .update(authorityJurisdictions)
          .set({ status: 'INACTIVE' })
          .where(inArray(authorityJurisdictions.id, activeJurIds));
      }

      const result = await competentAuthorityService.getEligibleAuthoritiesForCase(multiDistrictCaseId);
      assert.strictEqual(result.authorities.length, 0);
      assert.strictEqual(result.isMultiDistrict, true);
      assert.match(
        result.notice || '',
        /No single Competent Authority has jurisdiction covering all affected districts.*Administrative resolution is required/i
      );

      // Re-activate jurisdictions for subsequent tests
      if (activeJurIds.length > 0) {
        await db
          .update(authorityJurisdictions)
          .set({ status: 'ACTIVE' })
          .where(inArray(authorityJurisdictions.id, activeJurIds));
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. PROPOSAL PREPARATION & COMPETENT AUTHORITY SELECTION PERSISTENCE
  // ───────────────────────────────────────────────────────────────────────────

  describe('5. Proposal Preparation & Authority Selection Persistence', () => {
    let dcBangaloreId: string;
    let dcMysoreId: string;
    let proposalId: string;
    let proposalVersion1Id: string;

    before(async () => {
      // Fetch or create authorities
      const dcBlr = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-DC-BLR-PROP-${ts}`,
          authorityName: `DC Bengaluru Urban For Proposal ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      dcBangaloreId = dcBlr.id;
      createdAuthorityIds.push(dcBangaloreId);

      await competentAuthorityService.addJurisdiction(
        dcBangaloreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId1,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );

      const dcMys = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-DC-MYS-PROP-${ts}`,
          authorityName: `DC Mysuru For Proposal ${ts}`,
          designation: 'District Collector',
          authorityLevel: 'DISTRICT',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      dcMysoreId = dcMys.id;
      createdAuthorityIds.push(dcMysoreId);

      await competentAuthorityService.addJurisdiction(
        dcMysoreId,
        {
          stateId: stateUnitId,
          districtId: districtUnitId2,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );
    });

    it('5.1 Rejects proposal creation when selecting an ineligible Competent Authority', async () => {
      // Trying to select DC Mysuru for Single-District Case in Bengaluru Urban
      await assert.rejects(
        async () => {
          await acquisitionProposalService.createProposal(
            {
              acquisitionCaseId: singleDistrictCaseId,
              linkedInventoryId: singleDistrictInventoryId,
              competentAuthorityId: dcMysoreId, // Ineligible for BLR!
              acquisitionJustification:
                'Substantial justification for public rapid transit corridor.',
              publicPurpose:
                'Construction of high-speed mass rapid metro line.',
              legalFramework:
                'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (RFCTLARR)',
              landRequirementExplanation:
                'Linear track alignment and station terminal requirements.',
            },
            projectOfficerId
          );
        },
        (err: any) => {
          assert.strictEqual(err.name, 'BadRequestError');
          assert.match(
            err.message,
            /does not have valid jurisdiction over the affected parcels/i
          );
          return true;
        }
      );
    });

    it('5.2 Successfully creates proposal draft with eligible Competent Authority and records ACTIVE assignment', async () => {
      const created = await acquisitionProposalService.createProposal(
        {
          acquisitionCaseId: singleDistrictCaseId,
          linkedInventoryId: singleDistrictInventoryId,
          competentAuthorityId: dcBangaloreId, // Eligible for BLR!
          acquisitionJustification:
            'Substantial justification for public rapid transit corridor.',
          publicPurpose:
            'Construction of high-speed mass rapid metro line.',
          legalFramework:
            'Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (RFCTLARR)',
          landRequirementExplanation:
            'Linear track alignment and station terminal requirements.',
        },
        projectOfficerId
      );

      assert.ok(created.id);
      proposalId = created.id;
      createdProposalIds.push(proposalId);
      assert.strictEqual(created.currentStatus, 'DRAFT');
      assert.strictEqual(created.currentVersionNumber, 1);

      proposalVersion1Id = created.currentVersion!.id;

      // Verify selectedAuthorityId on Version 1
      const [ver] = await db
        .select()
        .from(acquisitionProposalVersions)
        .where(eq(acquisitionProposalVersions.id, proposalVersion1Id));
      assert.strictEqual(ver.selectedAuthorityId, dcBangaloreId);

      // Verify record in proposalAuthorityAssignments
      const [assignment] = await db
        .select()
        .from(proposalAuthorityAssignments)
        .where(
          eq(proposalAuthorityAssignments.proposalVersionId, proposalVersion1Id)
        );
      assert.ok(assignment, 'Proposal authority assignment record must exist');
      assert.strictEqual(assignment.authorityId, dcBangaloreId);
      assert.strictEqual(assignment.assignmentStatus, 'ACTIVE');
      assert.strictEqual(assignment.assignedBy, projectOfficerId);

      // Verify details returned by findProposalById includes selectedAuthority
      assert.ok(created.selectedAuthority);
      assert.strictEqual(created.selectedAuthority.id, dcBangaloreId);
      assert.strictEqual(created.selectedAuthority.assignment?.assignmentStatus, 'ACTIVE');
    });

    it('5.3 Discovery endpoint for proposal returns eligible authorities matching case geography', async () => {
      const req = new NextRequest(
        `http://localhost/api/acquisition-proposals/${proposalId}/eligible-authorities`,
        {
          method: 'GET',
          headers: { Cookie: projectOfficerCookie },
        }
      );

      const res = await getProposalEligibleAuthoritiesHandler(req, {
        params: Promise.resolve({ id: proposalId }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.some((a: any) => a.id === dcBangaloreId));
    });

    it('5.4 Updating draft proposal authority supersedes previous assignment and creates new active assignment', async () => {
      // Create a state authority covering all Karnataka
      const stateAuth = await competentAuthorityService.createAuthority(
        {
          authorityCode: `CA-STATE-UPD-${ts}`,
          authorityName: `State Authority Update ${ts}`,
          designation: 'Designated State Government Authority',
          authorityLevel: 'STATE',
          status: 'ACTIVE',
          effectiveFrom: '2026-01-01',
        },
        superAdminId
      );
      createdAuthorityIds.push(stateAuth.id);

      await competentAuthorityService.addJurisdiction(
        stateAuth.id,
        {
          stateId: stateUnitId,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        },
        superAdminId
      );

      // Update proposal draft to select the state authority
      const updated = await acquisitionProposalService.updateDraftProposal(
        proposalId,
        {
          competentAuthorityId: stateAuth.id,
          acquisitionJustification:
            'Updated justification for mass rapid transit corridor project.',
        },
        projectOfficerId
      );

      assert.strictEqual(updated.currentVersion?.selectedAuthorityId, stateAuth.id);
      assert.strictEqual(updated.selectedAuthority?.id, stateAuth.id);

      // Verify old assignment is SUPERSEDED
      const oldAssignment = await db
        .select()
        .from(proposalAuthorityAssignments)
        .where(
          sql`${proposalAuthorityAssignments.proposalVersionId} = ${proposalVersion1Id}::uuid AND ${proposalAuthorityAssignments.authorityId} = ${dcBangaloreId}::uuid`
        );
      assert.strictEqual(oldAssignment[0].assignmentStatus, 'SUPERSEDED');

      // Verify new assignment is ACTIVE
      const newAssignment = await db
        .select()
        .from(proposalAuthorityAssignments)
        .where(
          sql`${proposalAuthorityAssignments.proposalVersionId} = ${proposalVersion1Id}::uuid AND ${proposalAuthorityAssignments.authorityId} = ${stateAuth.id}::uuid`
        );
      assert.strictEqual(newAssignment[0].assignmentStatus, 'ACTIVE');
    });

    it('5.5 Creating next version carries forward authority selection with new active assignment', async () => {
      // Transition proposal to CORRECTION_REQUESTED directly in DB to simulate workflow progression
      await db
        .update(acquisitionProposals)
        .set({ currentStatus: 'CORRECTION_REQUESTED' })
        .where(eq(acquisitionProposals.id, proposalId));
      await db
        .update(acquisitionProposalVersions)
        .set({ status: 'CORRECTION_REQUESTED' })
        .where(eq(acquisitionProposalVersions.id, proposalVersion1Id));

      // Create Version 2
      const ver2Proposal = await acquisitionProposalService.createNextVersion(
        proposalId,
        projectOfficerId,
        'Initialized Version 2 for corrections'
      );

      assert.strictEqual(ver2Proposal.currentVersionNumber, 2);
      assert.strictEqual(ver2Proposal.currentStatus, 'DRAFT');

      const ver2 = ver2Proposal.currentVersion!;
      assert.strictEqual(ver2.versionNumber, 2);
      assert.ok(ver2.selectedAuthorityId, 'Selected authority must be carried forward to Version 2');

      // Check that a new active assignment exists for Version 2
      const [ver2Assignment] = await db
        .select()
        .from(proposalAuthorityAssignments)
        .where(
          eq(proposalAuthorityAssignments.proposalVersionId, ver2.id)
        );
      assert.ok(ver2Assignment, 'Version 2 must have an authority assignment');
      assert.strictEqual(ver2Assignment.assignmentStatus, 'ACTIVE');
      assert.strictEqual(ver2Assignment.authorityId, ver2.selectedAuthorityId);
    });
  });
});
