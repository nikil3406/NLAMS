import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { proposalValidationService } from '../../src/services/acquisition-proposals/proposal-validation.service';
import { acquisitionProposalService } from '../../src/services/acquisition-proposals/acquisition-proposal.service';

// Route Handlers
import {
  POST as createProposalHandler,
  GET as listProposalsHandler,
} from '../../src/app/api/acquisition-proposals/route';
import {
  GET as getProposalHandler,
  PATCH as updateProposalHandler,
} from '../../src/app/api/acquisition-proposals/[id]/route';
import { POST as validateProposalHandler } from '../../src/app/api/acquisition-proposals/[id]/validate/route';
import { POST as submitProposalHandler } from '../../src/app/api/acquisition-proposals/[id]/submit/route';
import { GET as reviewDashboardHandler } from '../../src/app/api/competent-authorities/reviews/route';
import { GET as myAuthoritiesHandler } from '../../src/app/api/competent-authorities/my-authorities/route';

describe('NLAMS – Step 3B: Unified Proposal Validation, Submission & Competent Authority Review Dashboard', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let projectOfficerId: string;
  let projectOfficerCookie: string;

  let outOfScopeOfficerId: string;
  let outOfScopeOfficerCookie: string;

  let authorityOfficer1Id: string;
  let authorityOfficer1Cookie: string;

  let authorityOfficer2Id: string;
  let authorityOfficer2Cookie: string;

  let unrelatedOfficerId: string;
  let unrelatedOfficerCookie: string;

  // Administrative units
  let stateKAId: string;
  let districtBLRId: string;
  let districtMYSId: string;
  let stateMHId: string;

  // Agency & Project
  let agencyId: string;
  let projectId: string;

  // Parcels
  let pBLRId: string;
  let pMYSId: string;

  // Competent Authorities
  let eligibleSingleDistrictAuthId: string; // District Collector BLR (covers BLR)
  let eligibleMultiDistrictAuthId: string; // Regional Commissioner (covers KA State)
  let unrelatedAuthId: string; // Authority covering MH (unrelated to KA)

  // Tracking IDs for cleanup
  const createdProposalIds: string[] = [];
  const createdAuthorityIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdInventoryIds: string[] = [];

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

  let caseCounter = 1;
  const createTestCaseWithInventory = async (isMulti: boolean = false) => {
    const num = caseCounter++;
    const [acqCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-3B-GEN-${num}-${ts}`,
        title: `Generated Case ${num} ${ts}`,
        projectId: projectId,
        status: 'APPROVED',
        createdBy: projectOfficerId,
        updatedBy: projectOfficerId,
      })
      .returning();
    createdCaseIds.push(acqCase.id);

    const [cp1] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId: acqCase.id,
        parcelId: pBLRId,
        proposedAffectedArea: '2000.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();

    let totalCount = 1;
    let recArea = '10000.0000';
    let affArea = '2000.0000';

    if (isMulti) {
      const [cp2] = await db
        .insert(acquisitionCaseParcels)
        .values({
          caseId: acqCase.id,
          parcelId: pMYSId,
          proposedAffectedArea: '3000.0000',
          affectedAreaUnit: 'SQ_M',
          createdBy: projectOfficerId,
        })
        .returning();
      totalCount = 2;
      recArea = '22000.0000';
      affArea = '5000.0000';

      const [inv] = await db
        .insert(verifiedLandInventories)
        .values({
          caseId: acqCase.id,
          versionNumber: 1,
          status: 'APPROVED',
          totalParcelCount: totalCount,
          aggregateRecordedArea: recArea,
          aggregateAffectedArea: affArea,
          areaUnit: 'SQ_M',
          preparedBy: projectOfficerId,
          submittedBy: projectOfficerId,
          reviewedBy: superAdminId,
          reviewedAt: new Date(),
        })
        .returning();
      createdInventoryIds.push(inv.id);

      await db.insert(inventoryParcelSnapshots).values([
        {
          inventoryId: inv.id,
          parcelId: pBLRId,
          caseParcelId: cp1.id,
          state: 'Karnataka',
          district: 'Bengaluru Urban',
          taluk: 'Bengaluru North',
          village: 'Hebbal',
          surveyNumber: '501/A',
          recordedArea: '10000.0000',
          recordedAreaUnit: 'SQ_M',
          proposedAffectedArea: '2000.0000',
          proposedAffectedAreaUnit: 'SQ_M',
        },
        {
          inventoryId: inv.id,
          parcelId: pMYSId,
          caseParcelId: cp2.id,
          state: 'Karnataka',
          district: 'Mysuru',
          taluk: 'Mysuru Taluk',
          village: 'Varuna',
          surveyNumber: '602/B',
          recordedArea: '12000.0000',
          recordedAreaUnit: 'SQ_M',
          proposedAffectedArea: '3000.0000',
          proposedAffectedAreaUnit: 'SQ_M',
        },
      ]);
      return { caseId: acqCase.id, inventoryId: inv.id };
    }

    const [inv] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: acqCase.id,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: totalCount,
        aggregateRecordedArea: recArea,
        aggregateAffectedArea: affArea,
        areaUnit: 'SQ_M',
        preparedBy: projectOfficerId,
        submittedBy: projectOfficerId,
        reviewedBy: superAdminId,
        reviewedAt: new Date(),
      })
      .returning();
    createdInventoryIds.push(inv.id);

    await db.insert(inventoryParcelSnapshots).values({
      inventoryId: inv.id,
      parcelId: pBLRId,
      caseParcelId: cp1.id,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Hebbal',
      surveyNumber: '501/A',
      recordedArea: '10000.0000',
      recordedAreaUnit: 'SQ_M',
      proposedAffectedArea: '2000.0000',
      proposedAffectedAreaUnit: 'SQ_M',
    });

    return { caseId: acqCase.id, inventoryId: inv.id };
  };

  before(async () => {
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

    assert.ok(ka && blr && mys && mh, 'Administrative units KA, BLR, MYS, MH must exist');
    stateKAId = ka.id;
    districtBLRId = blr.id;
    districtMYSId = mys.id;
    stateMHId = mh.id;

    // 2. Fetch roles
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));
    const pwdHash = await passwordService.hashPassword('Pass@12345678');

    const makeUser = async (name: string, emailPrefix: string) => {
      const [u] = await db
        .insert(users)
        .values({
          name: `${name} ${ts}`,
          email: `${emailPrefix}.${ts}@nlams.test`,
          passwordHash: pwdHash,
          status: 'ACTIVE',
        })
        .returning();
      createdUserIds.push(u.id);
      return u.id;
    };

    const makeSession = async (userId: string) => {
      const { token } = await sessionService.createSession(userId);
      return `${authConfig.cookieName}=${token}`;
    };

    // Super Admin
    superAdminId = await makeUser('Super Admin 3B', 'sa3b');
    await db.insert(userRoles).values({
      userId: superAdminId,
      roleId: roleMap.get('SUPER_ADMIN')!,
      assignedBy: superAdminId,
    });
    superAdminCookie = await makeSession(superAdminId);

    // Ministry Admin
    ministryAdminId = await makeUser('Ministry Admin 3B', 'ma3b');
    await db.insert(userRoles).values({
      userId: ministryAdminId,
      roleId: roleMap.get('MINISTRY_ADMIN')!,
      assignedBy: superAdminId,
    });
    ministryAdminCookie = await makeSession(ministryAdminId);

    // Project Officer (Implementing Agency in KA)
    projectOfficerId = await makeUser('Project Officer 3B', 'po3b');
    await db.insert(userRoles).values({
      userId: projectOfficerId,
      roleId: roleMap.get('PROJECT_OFFICER')!,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: projectOfficerId,
      administrativeUnitId: stateKAId,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    projectOfficerCookie = await makeSession(projectOfficerId);

    // Out of scope Project Officer (in MH)
    outOfScopeOfficerId = await makeUser('Out of Scope Officer 3B', 'ooso3b');
    await db.insert(userRoles).values({
      userId: outOfScopeOfficerId,
      roleId: roleMap.get('PROJECT_OFFICER')!,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: outOfScopeOfficerId,
      administrativeUnitId: stateMHId,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    outOfScopeOfficerCookie = await makeSession(outOfScopeOfficerId);

    // Authority Officer 1 (Assigned to Regional Commissioner & DC BLR)
    authorityOfficer1Id = await makeUser('Authority Officer 1', 'auth1.3b');
    authorityOfficer1Cookie = await makeSession(authorityOfficer1Id);

    // Authority Officer 2 (Assigned to MH Authority)
    authorityOfficer2Id = await makeUser('Authority Officer 2', 'auth2.3b');
    authorityOfficer2Cookie = await makeSession(authorityOfficer2Id);

    // Unrelated Officer (No authority assignments)
    unrelatedOfficerId = await makeUser('Unrelated Officer', 'unrel.3b');
    unrelatedOfficerCookie = await makeSession(unrelatedOfficerId);

    // Assign COMPETENT_AUTHORITY role if present in system
    const caRoleId = roleMap.get('COMPETENT_AUTHORITY');
    if (caRoleId) {
      await db.insert(userRoles).values([
        { userId: authorityOfficer1Id, roleId: caRoleId, assignedBy: superAdminId },
        { userId: authorityOfficer2Id, roleId: caRoleId, assignedBy: superAdminId },
        { userId: unrelatedOfficerId, roleId: caRoleId, assignedBy: superAdminId },
      ]);
    }

    // 3. Implementing Agency & Project
    const [agency] = await db.select().from(implementingAgencies).limit(1);
    agencyId = agency.id;

    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-3B-${ts}`,
        name: `Integrated Freight Corridor 3B ${ts}`,
        projectType: 'INFRASTRUCTURE',
        status: 'REGISTERED',
        administrativeUnitId: stateKAId,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning();
    projectId = proj.id;

    // 4. Create base land parcels
    const [pBLR] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-3B-BLR-${ts}`,
        administrativeUnitId: districtBLRId,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Hebbal',
        surveyNumber: '501/A',
        totalArea: '10000.0000',
        areaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();
    pBLRId = pBLR.id;

    const [pMYS] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-3B-MYS-${ts}`,
        administrativeUnitId: districtMYSId,
        state: 'Karnataka',
        district: 'Mysuru',
        taluk: 'Mysuru Taluk',
        village: 'Varuna',
        surveyNumber: '602/B',
        totalArea: '12000.0000',
        areaUnit: 'SQ_M',
        createdBy: projectOfficerId,
      })
      .returning();
    pMYSId = pMYS.id;

    // 5. Setup Competent Authorities
    const createAuth = async (
      code: string,
      name: string,
      designation: string,
      level: 'DISTRICT' | 'REGIONAL' | 'STATE' | 'CENTRAL',
      status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
      from: string = '2025-01-01',
      until: string | null = null
    ) => {
      const [auth] = await db
        .insert(competentAuthorities)
        .values({
          authorityCode: `${code}-${ts}`,
          authorityName: `${name} ${ts}`,
          designation,
          authorityLevel: level,
          status,
          effectiveFrom: from,
          effectiveUntil: until,
        })
        .returning();
      createdAuthorityIds.push(auth.id);
      return auth.id;
    };

    // Authority 1: District Collector BLR (covers BLR only)
    eligibleSingleDistrictAuthId = await createAuth('CA-DC-BLR', 'District Collector BLR', 'District Collector', 'DISTRICT');
    await db.insert(authorityJurisdictions).values({
      authorityId: eligibleSingleDistrictAuthId,
      stateId: stateKAId,
      districtId: districtBLRId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });
    await db.insert(authorityUserAssignments).values({
      authorityId: eligibleSingleDistrictAuthId,
      userId: authorityOfficer1Id,
      assignedBy: superAdminId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });

    // Authority 2: Regional Commissioner (covers KA State - all districts)
    eligibleMultiDistrictAuthId = await createAuth('CA-REG-COMM', 'Divisional Commissioner', 'Divisional Commissioner', 'REGIONAL');
    await db.insert(authorityJurisdictions).values({
      authorityId: eligibleMultiDistrictAuthId,
      stateId: stateKAId,
      districtId: null, // Statewide coverage
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });
    await db.insert(authorityUserAssignments).values({
      authorityId: eligibleMultiDistrictAuthId,
      userId: authorityOfficer1Id,
      assignedBy: superAdminId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });

    // Authority 3: Unrelated Authority in Maharashtra (assigned to Officer 2)
    unrelatedAuthId = await createAuth('CA-MH-PUNE', 'Pune Collector', 'District Collector', 'DISTRICT');
    await db.insert(authorityJurisdictions).values({
      authorityId: unrelatedAuthId,
      stateId: stateMHId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });
    await db.insert(authorityUserAssignments).values({
      authorityId: unrelatedAuthId,
      userId: authorityOfficer2Id,
      assignedBy: superAdminId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });
  });

  after(async () => {
    // Clean up created proposals
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

    // Clean up authorities
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
    if (createdInventoryIds.length > 0) {
      await db
        .delete(inventoryParcelSnapshots)
        .where(inArray(inventoryParcelSnapshots.inventoryId, createdInventoryIds));
      await db
        .delete(verifiedLandInventories)
        .where(inArray(verifiedLandInventories.id, createdInventoryIds));
    }
    if (createdCaseIds.length > 0) {
      await db
        .delete(acquisitionCaseParcels)
        .where(inArray(acquisitionCaseParcels.caseId, createdCaseIds));
      await db
        .delete(acquisitionCases)
        .where(inArray(acquisitionCases.id, createdCaseIds));
    }
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(landParcels).where(inArray(landParcels.createdBy, [projectOfficerId]));

    // Clean up users
    await db.delete(userAssignments).where(inArray(userAssignments.userId, [projectOfficerId, outOfScopeOfficerId]));
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));

    await client.end();
  });

  // Helper to create a draft proposal
  const createDraft = async (
    caseId: string,
    invId: string,
    authorityId?: string,
    cookie: string = projectOfficerCookie
  ) => {
    const req = makeReq('POST', 'http://localhost/api/acquisition-proposals', cookie, {
      acquisitionCaseId: caseId,
      linkedInventoryId: invId,
      competentAuthorityId: authorityId,
      acquisitionJustification: 'Critical national rail freight corridor connecting inland multimodal logistics park.',
      publicPurpose: 'National transportation infrastructure development under Dedicated Freight Corridor scheme.',
      legalFramework: 'Right to Fair Compensation and Transparency in Land Acquisition Act, 2013',
      landRequirementExplanation: '60-meter right of way required for twin-track electrified freight line and buffer.',
      administrativeApprovalRef: 'RLY-BD-2026-8822',
      administrativeApprovalDate: '2026-03-01',
      supportingDocuments: [
        {
          documentType: 'Administrative Sanction',
          documentNumber: 'AS-RLY-2026-01',
          title: 'Railway Board Sanction Order',
          fileUrl: '/documents/railways/as-8822.pdf',
        },
      ],
    });

    const res = await createProposalHandler(req);
    const json = await res.json();
    if (res.status === 201 && json.data?.id) {
      createdProposalIds.push(json.data.id);
    }
    return { res, json };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. UNIFIED PROPOSAL VALIDATION (COMPETENT AUTHORITY CHECKS)
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Unified Proposal Validation (Competent Authority Checks)', () => {
    it('1.1 Rejects validation with blocking error when Competent Authority is NOT selected', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);

      const [header] = await db
        .insert(acquisitionProposals)
        .values({
          proposalNumber: `PROP-NO-AUTH-${caseCounter}-${ts}`,
          acquisitionCaseId: caseId,
          projectId: projectId,
          implementingAgencyId: agencyId,
          createdBy: projectOfficerId,
          linkedInventoryId: inventoryId,
          linkedInventoryVersionId: inventoryId,
          currentVersionNumber: 1,
          currentStatus: 'DRAFT',
        })
        .returning();
      createdProposalIds.push(header.id);

      const [ver] = await db
        .insert(acquisitionProposalVersions)
        .values({
          proposalId: header.id,
          versionNumber: 1,
          status: 'DRAFT',
          acquisitionJustification: 'Justification content exceeding twenty characters.',
          publicPurpose: 'Public purpose explanation.',
          legalFramework: 'RFCTLARR Act 2013',
          landRequirementExplanation: 'Detailed land requirement explanation.',
          selectedAuthorityId: null, // Omitted
          createdBy: projectOfficerId,
        })
        .returning();

      await db
        .update(acquisitionProposals)
        .set({ currentVersionId: ver.id })
        .where(eq(acquisitionProposals.id, header.id));

      const report = await proposalValidationService.validateProposal(header.id);

      assert.equal(report.hasBlockingErrors, true, 'Validation must have blocking errors');
      assert.equal(report.overallResult, 'FAILED');
      const authSelectionCheck = report.checks.find((c) => c.id === 'AUTH-SELECTION');
      assert.ok(authSelectionCheck, 'AUTH-SELECTION check must be present');
      assert.equal(authSelectionCheck.status, 'FAILED');
      assert.equal(authSelectionCheck.isBlocking, true);
    });

    it('1.2 Rejects validation when selected authority does not exist in DB (AUTH-EXISTS)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const nonExistentAuthId = '00000000-0000-0000-0000-000000000099';

      const [header] = await db
        .insert(acquisitionProposals)
        .values({
          proposalNumber: `PROP-INVALID-AUTH-${caseCounter}-${ts}`,
          acquisitionCaseId: caseId,
          projectId: projectId,
          implementingAgencyId: agencyId,
          createdBy: projectOfficerId,
          linkedInventoryId: inventoryId,
          linkedInventoryVersionId: inventoryId,
          currentVersionNumber: 1,
          currentStatus: 'DRAFT',
        })
        .returning();
      createdProposalIds.push(header.id);

      const [ver] = await db
        .insert(acquisitionProposalVersions)
        .values({
          proposalId: header.id,
          versionNumber: 1,
          status: 'DRAFT',
          acquisitionJustification: 'Justification content exceeding twenty characters.',
          publicPurpose: 'Public purpose explanation.',
          legalFramework: 'RFCTLARR Act 2013',
          landRequirementExplanation: 'Detailed land requirement explanation.',
          selectedAuthorityId: nonExistentAuthId,
          createdBy: projectOfficerId,
        })
        .returning();

      await db
        .update(acquisitionProposals)
        .set({ currentVersionId: ver.id })
        .where(eq(acquisitionProposals.id, header.id));

      const report = await proposalValidationService.validateProposal(header.id);

      assert.equal(report.hasBlockingErrors, true);
      const existsCheck = report.checks.find((c) => c.id === 'AUTH-EXISTS');
      assert.ok(existsCheck);
      assert.equal(existsCheck.status, 'FAILED');
      assert.equal(existsCheck.isBlocking, true);
    });

    it('1.3 Rejects validation when selected authority is INACTIVE (AUTH-ACTIVE-STATUS)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);

      // Create a proposal with eligible authority, then deactivate authority to test detection
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      // Temporarily mark authority INACTIVE
      await db
        .update(competentAuthorities)
        .set({ status: 'INACTIVE' })
        .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));

      try {
        const report = await proposalValidationService.validateProposal(json.data.id);

        assert.equal(report.hasBlockingErrors, true);
        const statusCheck = report.checks.find((c) => c.id === 'AUTH-ACTIVE-STATUS');
        assert.ok(statusCheck);
        assert.equal(statusCheck.status, 'FAILED');
        assert.equal(statusCheck.isBlocking, true);
      } finally {
        // Re-activate authority
        await db
          .update(competentAuthorities)
          .set({ status: 'ACTIVE' })
          .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));
      }
    });

    it('1.4 Rejects validation when selected authority has expired effective dates (AUTH-EFFECTIVE-DATES)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      // Temporarily set expired dates
      await db
        .update(competentAuthorities)
        .set({ effectiveFrom: '2020-01-01', effectiveUntil: '2021-01-01' })
        .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));

      try {
        const report = await proposalValidationService.validateProposal(json.data.id);

        assert.equal(report.hasBlockingErrors, true);
        const dateCheck = report.checks.find((c) => c.id === 'AUTH-EFFECTIVE-DATES');
        assert.ok(dateCheck);
        assert.equal(dateCheck.status, 'FAILED');
        assert.equal(dateCheck.isBlocking, true);
      } finally {
        // Restore dates
        await db
          .update(competentAuthorities)
          .set({ effectiveFrom: '2025-01-01', effectiveUntil: null })
          .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));
      }
    });

    it('1.5 Rejects validation when authority has no active jurisdiction configured (AUTH-JURISDICTION-CONFIG)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      // Temporarily inactivate jurisdictions
      await db
        .update(authorityJurisdictions)
        .set({ status: 'INACTIVE' })
        .where(eq(authorityJurisdictions.authorityId, eligibleSingleDistrictAuthId));

      try {
        const report = await proposalValidationService.validateProposal(json.data.id);

        assert.equal(report.hasBlockingErrors, true);
        const jurCheck = report.checks.find((c) => c.id === 'AUTH-JURISDICTION-CONFIG');
        assert.ok(jurCheck);
        assert.equal(jurCheck.status, 'FAILED');
        assert.equal(jurCheck.isBlocking, true);
      } finally {
        await db
          .update(authorityJurisdictions)
          .set({ status: 'ACTIVE' })
          .where(eq(authorityJurisdictions.authorityId, eligibleSingleDistrictAuthId));
      }
    });

    it('1.6 Option A: Rejects selection of District Collector for multi-district case (AUTH-JURISDICTION-COVERAGE)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(true);

      // Create draft proposal on multi-district case directly in DB pointing to DC BLR
      const [header] = await db
        .insert(acquisitionProposals)
        .values({
          proposalNumber: `PROP-MULTI-OPT-A-${caseCounter}-${ts}`,
          acquisitionCaseId: caseId,
          projectId: projectId,
          implementingAgencyId: agencyId,
          createdBy: projectOfficerId,
          linkedInventoryId: inventoryId,
          linkedInventoryVersionId: inventoryId,
          currentVersionNumber: 1,
          currentStatus: 'DRAFT',
        })
        .returning();
      createdProposalIds.push(header.id);

      const [ver] = await db
        .insert(acquisitionProposalVersions)
        .values({
          proposalId: header.id,
          versionNumber: 1,
          status: 'DRAFT',
          acquisitionJustification: 'Justification content exceeding twenty characters.',
          publicPurpose: 'Public purpose explanation.',
          legalFramework: 'RFCTLARR Act 2013',
          landRequirementExplanation: 'Detailed land requirement explanation.',
          selectedAuthorityId: eligibleSingleDistrictAuthId, // District level!
          createdBy: projectOfficerId,
        })
        .returning();

      await db
        .update(acquisitionProposals)
        .set({ currentVersionId: ver.id })
        .where(eq(acquisitionProposals.id, header.id));

      await db.insert(proposalAuthorityAssignments).values({
        proposalId: header.id,
        proposalVersionId: ver.id,
        authorityId: eligibleSingleDistrictAuthId,
        assignedBy: projectOfficerId,
        assignmentStatus: 'ACTIVE',
      });

      const report = await proposalValidationService.validateProposal(header.id);

      assert.equal(report.hasBlockingErrors, true);
      const coverageCheck = report.checks.find((c) => c.id === 'AUTH-JURISDICTION-COVERAGE');
      assert.ok(coverageCheck);
      assert.equal(coverageCheck.status, 'FAILED');
      assert.equal(coverageCheck.isBlocking, true);
      assert.match(coverageCheck.message, /Option A Violation/);
    });

    it('1.7 Rejects validation when authority has no active user assignments (AUTH-USER-ASSIGNMENT)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      // Temporarily inactivate user assignments
      await db
        .update(authorityUserAssignments)
        .set({ status: 'INACTIVE' })
        .where(eq(authorityUserAssignments.authorityId, eligibleSingleDistrictAuthId));

      try {
        const report = await proposalValidationService.validateProposal(json.data.id);

        assert.equal(report.hasBlockingErrors, true);
        const userCheck = report.checks.find((c) => c.id === 'AUTH-USER-ASSIGNMENT');
        assert.ok(userCheck);
        assert.equal(userCheck.status, 'FAILED');
        assert.equal(userCheck.isBlocking, true);
      } finally {
        await db
          .update(authorityUserAssignments)
          .set({ status: 'ACTIVE' })
          .where(eq(authorityUserAssignments.authorityId, eligibleSingleDistrictAuthId));
      }
    });

    it('1.8 Valid proposal with eligible authority passes all checks (overallResult: PASSED)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      const report = await proposalValidationService.validateProposal(json.data.id);

      assert.equal(report.hasBlockingErrors, false, 'Valid proposal must have no blocking errors');
      assert.equal(report.overallResult, 'PASSED', 'Overall validation result must be PASSED');

      const caChecks = report.checks.filter((c) => c.category === 'COMPETENT_AUTHORITY');
      assert.ok(caChecks.length >= 8, 'Competent Authority checks must be present');
      assert.ok(caChecks.every((c) => c.status === 'PASSED'), 'All CA checks must pass');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PROPOSAL SUBMISSION INTEGRATION & IMMUTABILITY
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Proposal Submission Integration & Immutability', () => {
    let validProposalId: string;

    before(async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);
      validProposalId = json.data.id;
    });

    it('2.1 Rejects proposal submission if blocking validation errors exist (400 Bad Request)', async () => {
      const { caseId, inventoryId } = await createTestCaseWithInventory(false);
      const { json } = await createDraft(caseId, inventoryId, eligibleSingleDistrictAuthId);
      assert.ok(json.data?.id);

      // Temporarily mark authority INACTIVE so submission validation blocks it
      await db
        .update(competentAuthorities)
        .set({ status: 'INACTIVE' })
        .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));

      try {
        const req = makeReq('POST', `http://localhost/api/acquisition-proposals/${json.data.id}/submit`, projectOfficerCookie, {
          remarks: 'Attempting invalid submission',
        });
        const res = await submitProposalHandler(req, { params: Promise.resolve({ id: json.data.id }) });

        assert.equal(res.status, 400);
        const resJson = await res.json();
        assert.equal(resJson.success, false);
        assert.match(resJson.error, /validation failed/);
      } finally {
        await db
          .update(competentAuthorities)
          .set({ status: 'ACTIVE' })
          .where(eq(competentAuthorities.id, eligibleSingleDistrictAuthId));
      }
    });

    it('2.2 Rejects submission by unauthorized user (Land Officer or Out of Scope - 403 Forbidden)', async () => {
      const req = makeReq('POST', `http://localhost/api/acquisition-proposals/${validProposalId}/submit`, outOfScopeOfficerCookie, {
        remarks: 'Unauthorized submission attempt',
      });
      const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

      assert.equal(res.status, 403, 'Out-of-scope agency officer cannot submit proposal');
    });

    it('2.3 Authorized Implementing Agency user successfully submits valid proposal (200 OK)', async () => {
      const req = makeReq('POST', `http://localhost/api/acquisition-proposals/${validProposalId}/submit`, projectOfficerCookie, {
        remarks: 'Formal proposal transmittal to District Collector BLR for scrutiny.',
      });
      const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

      assert.equal(res.status, 200, 'Proposal submission must succeed with 200 OK');
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.currentStatus, 'SUBMITTED', 'Proposal header status must transition to SUBMITTED');
      assert.equal(json.data.currentVersion.status, 'SUBMITTED', 'Version status must transition to SUBMITTED');
      assert.equal(json.data.currentVersion.submittedBy, projectOfficerId);
      assert.ok(json.data.currentVersion.submittedAt);

      // Verify authority assignment preserved on submitted version
      assert.equal(json.data.currentVersion.selectedAuthorityId, eligibleSingleDistrictAuthId);
      assert.ok(json.data.selectedAuthority);
      assert.equal(json.data.selectedAuthority.id, eligibleSingleDistrictAuthId);

      // Verify audit history
      const submitAudit = json.data.workflowHistory.find((w: any) => w.action === 'SUBMIT');
      assert.ok(submitAudit, 'SUBMIT action must be recorded in workflow history');
      assert.equal(submitAudit.toStatus, 'SUBMITTED');
      assert.equal(submitAudit.actorId, projectOfficerId);
    });

    it('2.4 Prevents duplicate submission of an already submitted proposal (400 Bad Request)', async () => {
      const req = makeReq('POST', `http://localhost/api/acquisition-proposals/${validProposalId}/submit`, projectOfficerCookie, {
        remarks: 'Duplicate submission attempt',
      });
      const res = await submitProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

      assert.equal(res.status, 400);
      const json = await res.json();
      assert.match(json.error, /is in 'SUBMITTED' status/);
    });

    it('2.5 Submitted version is immutable: ordinary draft updates are rejected (400 Bad Request)', async () => {
      const req = makeReq('PATCH', `http://localhost/api/acquisition-proposals/${validProposalId}`, projectOfficerCookie, {
        acquisitionJustification: 'Modified text on submitted version should fail.',
      });
      const res = await updateProposalHandler(req, { params: Promise.resolve({ id: validProposalId }) });

      assert.equal(res.status, 400, 'Submitted version cannot be modified via draft API');
      const json = await res.json();
      assert.match(json.error, /Cannot edit proposal|Cannot update draft/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. COMPETENT AUTHORITY REVIEW DASHBOARD
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. Competent Authority Review Dashboard', () => {
    let submittedProposalBLRId: string;
    let submittedProposalMultiId: string;

    before(async () => {
      // 1. Submit single-district proposal to DC BLR
      const c1 = await createTestCaseWithInventory(false);
      const p1 = await createDraft(c1.caseId, c1.inventoryId, eligibleSingleDistrictAuthId);
      submittedProposalBLRId = p1.json.data.id;
      const subReq1 = makeReq('POST', `http://localhost/api/acquisition-proposals/${submittedProposalBLRId}/submit`, projectOfficerCookie, {
        remarks: 'Submitted for DC BLR review',
      });
      await submitProposalHandler(subReq1, { params: Promise.resolve({ id: submittedProposalBLRId }) });

      // 2. Submit multi-district proposal to Regional Commissioner
      const c2 = await createTestCaseWithInventory(true);
      const p2 = await createDraft(c2.caseId, c2.inventoryId, eligibleMultiDistrictAuthId);
      submittedProposalMultiId = p2.json.data.id;
      const subReq2 = makeReq('POST', `http://localhost/api/acquisition-proposals/${submittedProposalMultiId}/submit`, projectOfficerCookie, {
        remarks: 'Submitted for Regional Commissioner review',
      });
      await submitProposalHandler(subReq2, { params: Promise.resolve({ id: submittedProposalMultiId }) });
    });

    it('3.1 Rejects review dashboard access from users without Competent Authority assignment (403 Forbidden)', async () => {
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', unrelatedOfficerCookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.match(json.error, /do not have active Competent Authority review privileges/);
    });

    it('3.2 MINISTRY_ADMIN does NOT automatically receive Competent Authority review access (403 Forbidden)', async () => {
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', ministryAdminCookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 403, 'Ministry Admin must not automatically receive CA scrutiny access');
    });

    it('3.3 Authorized Competent Authority user sees proposals submitted to their authorities', async () => {
      // Authority Officer 1 is assigned to DC BLR and Regional Commissioner
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', authorityOfficer1Cookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.length >= 2, 'Must return at least 2 submitted proposals');

      const proposalIds = json.data.map((p: any) => p.id);
      assert.ok(proposalIds.includes(submittedProposalBLRId), 'DC BLR proposal must be visible');
      assert.ok(proposalIds.includes(submittedProposalMultiId), 'Regional Commissioner proposal must be visible');

      // Verify row structure matches specification
      const row = json.data.find((p: any) => p.id === submittedProposalBLRId);
      assert.ok(row.proposalNumber);
      assert.ok(row.projectName);
      assert.ok(row.acquisitionCaseTitle);
      assert.ok(row.implementingAgencyName);
      assert.ok(row.versionNumber >= 1);
      assert.ok(row.submissionDate);
      assert.ok(row.authorityName);
      assert.equal(row.status, 'SUBMITTED');
    });

    it('3.4 Competent Authority user CANNOT see proposals assigned to unrelated authorities', async () => {
      // Authority Officer 2 is assigned ONLY to Maharashtra authority (unrelatedAuthId)
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', authorityOfficer2Cookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);

      const proposalIds = json.data.map((p: any) => p.id);
      assert.ok(!proposalIds.includes(submittedProposalBLRId), 'Officer 2 must NOT see BLR proposal');
      assert.ok(!proposalIds.includes(submittedProposalMultiId), 'Officer 2 must NOT see Multi-district proposal');
    });

    it('3.5 Supports status filtering (e.g. ?status=SUBMITTED vs ?status=APPROVED)', async () => {
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews?status=SUBMITTED', authorityOfficer1Cookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.every((p: any) => p.status === 'SUBMITTED'));

      const reqEmpty = makeReq('GET', 'http://localhost/api/competent-authorities/reviews?status=APPROVED', authorityOfficer1Cookie);
      const resEmpty = await reviewDashboardHandler(reqEmpty);
      const jsonEmpty = await resEmpty.json();
      assert.equal(jsonEmpty.data.length, 0, 'No proposals in APPROVED status yet');
    });

    it('3.6 Supports search filtering by proposal number or project name', async () => {
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews?search=Integrated+Freight', authorityOfficer1Cookie);
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.length >= 1);
    });

    it('3.7 Authority Context Selector: User assigned to multiple authorities can filter by specific authority', async () => {
      // Officer 1 filters specifically for DC BLR authority
      const req = makeReq(
        'GET',
        `http://localhost/api/competent-authorities/reviews?authorityId=${eligibleSingleDistrictAuthId}`,
        authorityOfficer1Cookie
      );
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.every((p: any) => p.authorityId === eligibleSingleDistrictAuthId));
      assert.ok(json.data.some((p: any) => p.id === submittedProposalBLRId));
      assert.ok(!json.data.some((p: any) => p.id === submittedProposalMultiId));
    });

    it('3.8 Rejects frontend-supplied authorityId context that user is not authorized to represent (403 Forbidden)', async () => {
      // Officer 1 tries to filter by Maharashtra authority (unrelatedAuthId)
      const req = makeReq(
        'GET',
        `http://localhost/api/competent-authorities/reviews?authorityId=${unrelatedAuthId}`,
        authorityOfficer1Cookie
      );
      const res = await reviewDashboardHandler(req);

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.match(json.error, /not authorized to represent Competent Authority/);
    });

    it('3.9 my-authorities endpoint returns active authorities assigned to current user', async () => {
      const req = makeReq('GET', 'http://localhost/api/competent-authorities/my-authorities', authorityOfficer1Cookie);
      const res = await myAuthoritiesHandler(req);

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.length, 2, 'Officer 1 is assigned to 2 authorities');
      const authIds = json.data.map((a: any) => a.id);
      assert.ok(authIds.includes(eligibleSingleDistrictAuthId));
      assert.ok(authIds.includes(eligibleMultiDistrictAuthId));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. PROPOSAL DETAILS – COMPETENT AUTHORITY REVIEW ACCESS
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Proposal Details – Competent Authority Review Access', () => {
    let submittedProposalId: string;

    before(async () => {
      const c = await createTestCaseWithInventory(false);
      const p = await createDraft(c.caseId, c.inventoryId, eligibleSingleDistrictAuthId);
      submittedProposalId = p.json.data.id;
      const subReq = makeReq('POST', `http://localhost/api/acquisition-proposals/${submittedProposalId}/submit`, projectOfficerCookie, {
        remarks: 'Submitted for detail view access testing',
      });
      await submitProposalHandler(subReq, { params: Promise.resolve({ id: submittedProposalId }) });
    });

    it('4.1 Authorized Competent Authority user can view proposal details (200 OK)', async () => {
      // Authority Officer 1 is assigned to the selected authority (DC BLR)
      const req = makeReq('GET', `http://localhost/api/acquisition-proposals/${submittedProposalId}`, authorityOfficer1Cookie);
      const res = await getProposalHandler(req, { params: Promise.resolve({ id: submittedProposalId }) });

      assert.equal(res.status, 200, 'Assigned Competent Authority user must have read access');
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.id, submittedProposalId);
      assert.equal(json.data.currentStatus, 'SUBMITTED');
      assert.ok(json.data.project);
      assert.ok(json.data.acquisitionCase);
      assert.ok(json.data.implementingAgency);
      assert.ok(json.data.linkedInventory);
      assert.ok(json.data.currentVersion);
      assert.ok(json.data.selectedAuthority);
      assert.equal(json.data.selectedAuthority.id, eligibleSingleDistrictAuthId);
    });

    it('4.2 Competent Authority user assigned to a different authority receives 403 Forbidden', async () => {
      // Authority Officer 2 is assigned to Pune authority, NOT DC BLR
      const req = makeReq('GET', `http://localhost/api/acquisition-proposals/${submittedProposalId}`, authorityOfficer2Cookie);
      const res = await getProposalHandler(req, { params: Promise.resolve({ id: submittedProposalId }) });

      assert.equal(res.status, 403, 'Authority user assigned to a different authority must be forbidden');
    });

    it('4.3 Unassigned user receives 403 Forbidden when accessing submitted proposal', async () => {
      const req = makeReq('GET', `http://localhost/api/acquisition-proposals/${submittedProposalId}`, unrelatedOfficerCookie);
      const res = await getProposalHandler(req, { params: Promise.resolve({ id: submittedProposalId }) });

      assert.equal(res.status, 403);
    });
  });
});
