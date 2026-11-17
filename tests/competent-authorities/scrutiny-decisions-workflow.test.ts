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
} from '../../db/schema/verified-land-inventories';
import {
  acquisitionProposals,
  acquisitionProposalVersions,
  acquisitionProposalWorkflowHistory,
  proposalScrutinyObservations,
  proposalScrutinyDecisions,
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

// Route Handlers for Scrutiny & Decisions
import { POST as startReviewHandler } from '../../src/app/api/acquisition-proposals/[id]/start-review/route';
import {
  POST as createObservationHandler,
  GET as listObservationsHandler,
} from '../../src/app/api/acquisition-proposals/[id]/observations/route';
import { POST as recordDecisionHandler } from '../../src/app/api/acquisition-proposals/[id]/decisions/route';
import { GET as getHistoryHandler } from '../../src/app/api/acquisition-proposals/[id]/history/route';
import { POST as createProposalHandler } from '../../src/app/api/acquisition-proposals/route';
import { POST as submitProposalHandler } from '../../src/app/api/acquisition-proposals/[id]/submit/route';
import { POST as createVersionHandler } from '../../src/app/api/acquisition-proposals/[id]/versions/route';

describe('NLAMS – Step 3C: Competent Authority Scrutiny, Decisions & Workflow Integration', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let agencyOfficerId: string;
  let agencyOfficerCookie: string;

  let assignedCaUserId: string;
  let assignedCaUserCookie: string;

  let unassignedCaUserId: string;
  let unassignedCaUserCookie: string;

  // Administrative units & Project
  let stateKAId: string;
  let districtBLRId: string;
  let agencyId: string;
  let projectId: string;
  let pBLRId: string;

  // Competent Authority
  let authorityId: string;

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

    return new NextRequest(new URL(url, 'http://localhost:3000').toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const makeSession = async (userId: string) => {
    const { token } = await sessionService.createSession(userId);
    return `${authConfig.cookieName}=${token}`;
  };

  let caseCounter = 1;
  const createTestCaseWithInventory = async () => {
    const num = caseCounter++;
    const [acqCase] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-3C-GEN-${num}-${ts}`,
        title: `Generated Scrutiny Case ${num} ${ts}`,
        projectId: projectId,
        status: 'APPROVED',
        createdBy: agencyOfficerId,
        updatedBy: agencyOfficerId,
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
        createdBy: agencyOfficerId,
      })
      .returning();

    const [inv] = await db
      .insert(verifiedLandInventories)
      .values({
        caseId: acqCase.id,
        versionNumber: 1,
        status: 'APPROVED',
        totalParcelCount: 1,
        aggregateRecordedArea: '10000.0000',
        aggregateAffectedArea: '2000.0000',
        areaUnit: 'SQ_M',
        preparedBy: agencyOfficerId,
        submittedBy: agencyOfficerId,
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

    assert.ok(ka && blr, 'Administrative units KA and KA-BLR must exist in database');
    stateKAId = ka.id;
    districtBLRId = blr.id;

    // 2. Resolve roles
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

    // Super Admin
    superAdminId = await makeUser('Super Admin 3C', 'sa3c');
    await db.insert(userRoles).values({
      userId: superAdminId,
      roleId: roleMap.get('SUPER_ADMIN')!,
      assignedBy: superAdminId,
    });
    superAdminCookie = await makeSession(superAdminId);

    // Ministry Officer
    ministryAdminId = await makeUser('Ministry Admin 3C', 'ma3c');
    await db.insert(userRoles).values({
      userId: ministryAdminId,
      roleId: roleMap.get('MINISTRY_ADMIN')!,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: ministryAdminId,
      administrativeUnitId: stateKAId,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    ministryAdminCookie = await makeSession(ministryAdminId);

    // Project Officer (Implementing Agency in KA)
    agencyOfficerId = await makeUser('Agency Officer 3C', 'ag3c');
    await db.insert(userRoles).values({
      userId: agencyOfficerId,
      roleId: roleMap.get('PROJECT_OFFICER')!,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: agencyOfficerId,
      administrativeUnitId: stateKAId,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    agencyOfficerCookie = await makeSession(agencyOfficerId);

    // Assigned CA Officer
    assignedCaUserId = await makeUser('Assigned CA Officer 3C', 'ca-assigned3c');
    assignedCaUserCookie = await makeSession(assignedCaUserId);

    // Unassigned CA Officer
    unassignedCaUserId = await makeUser('Unassigned CA Officer 3C', 'ca-unassigned3c');
    unassignedCaUserCookie = await makeSession(unassignedCaUserId);

    // Assign COMPETENT_AUTHORITY role
    const caRoleId = roleMap.get('COMPETENT_AUTHORITY');
    assert.ok(caRoleId, 'COMPETENT_AUTHORITY role must exist');
    await db.insert(userRoles).values([
      { userId: assignedCaUserId, roleId: caRoleId, assignedBy: superAdminId },
      { userId: unassignedCaUserId, roleId: caRoleId, assignedBy: superAdminId },
    ]);

    // 3. Agency & Project
    const [agency] = await db.select().from(implementingAgencies).limit(1);
    agencyId = agency.id;

    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-3C-${ts}`,
        name: `High-Speed Transit Link 3C ${ts}`,
        projectType: 'INFRASTRUCTURE',
        status: 'REGISTERED',
        administrativeUnitId: stateKAId,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning();
    projectId = proj.id;

    // 4. Land Parcel
    const [pBLR] = await db
      .insert(landParcels)
      .values({
        parcelId: `PAR-3C-BLR-${ts}`,
        administrativeUnitId: districtBLRId,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Hebbal',
        surveyNumber: '501/A',
        totalArea: '10000.0000',
        areaUnit: 'SQ_M',
        createdBy: agencyOfficerId,
      })
      .returning();
    pBLRId = pBLR.id;

    // 5. Competent Authority (District Collector)
    const [auth] = await db
      .insert(competentAuthorities)
      .values({
        authorityCode: `CA-DC-3C-${ts}`,
        authorityName: `District Collector BLR Scrutiny ${ts}`,
        designation: 'District Collector',
        authorityLevel: 'DISTRICT',
        status: 'ACTIVE',
        effectiveFrom: '2025-01-01',
        createdBy: superAdminId,
      })
      .returning();
    authorityId = auth.id;
    createdAuthorityIds.push(authorityId);

    // Jurisdiction covering BLR
    await db.insert(authorityJurisdictions).values({
      authorityId: authorityId,
      stateId: stateKAId,
      districtId: districtBLRId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });

    // Assign CA officer to this authority
    await db.insert(authorityUserAssignments).values({
      authorityId: authorityId,
      userId: assignedCaUserId,
      assignedBy: superAdminId,
      effectiveFrom: '2025-01-01',
      status: 'ACTIVE',
    });
  });

  after(async () => {
    if (createdProposalIds.length > 0) {
      await db
        .delete(proposalScrutinyObservations)
        .where(inArray(proposalScrutinyObservations.proposalId, createdProposalIds));
      await db
        .delete(proposalScrutinyDecisions)
        .where(inArray(proposalScrutinyDecisions.proposalId, createdProposalIds));
      await db
        .delete(acquisitionProposalWorkflowHistory)
        .where(inArray(acquisitionProposalWorkflowHistory.proposalId, createdProposalIds));
      await db
        .delete(proposalAuthorityAssignments)
        .where(inArray(proposalAuthorityAssignments.proposalId, createdProposalIds));
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

    if (pBLRId) {
      await db.delete(landParcels).where(eq(landParcels.id, pBLRId));
    }

    if (projectId) {
      await db.delete(projects).where(eq(projects.id, projectId));
    }

    if (createdUserIds.length > 0) {
      await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
      await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }

    await client.end();
  });

  // Helper to create and submit a proposal for testing
  async function createAndSubmitTestProposal(suffix: string): Promise<string> {
    const { caseId, inventoryId } = await createTestCaseWithInventory();

    const createReq = makeReq('POST', 'http://localhost/api/acquisition-proposals', agencyOfficerCookie, {
      acquisitionCaseId: caseId,
      linkedInventoryId: inventoryId,
      competentAuthorityId: authorityId,
      acquisitionJustification: 'Critical high-speed transit corridor connecting regional hubs.',
      publicPurpose: `Public purpose rapid transit route corridor testing ${suffix}.`,
      legalFramework: 'Right to Fair Compensation and Transparency in Land Acquisition Act, 2013',
      landRequirementExplanation: '60-meter right of way required for twin-track transit line and safety buffer.',
      administrativeApprovalRef: `ADM-REF-3C-${suffix}`,
      administrativeApprovalDate: '2026-03-01',
      supportingDocuments: [
        {
          documentType: 'Administrative Sanction',
          documentNumber: `AS-3C-${suffix}`,
          title: 'Transit Board Sanction Order',
          fileUrl: '/documents/transit/as-8822.pdf',
        },
      ],
    });

    const createRes = await createProposalHandler(createReq);
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201, `Failed to create proposal: ${JSON.stringify(createData)}`);
    const propId = createData.data.id;
    createdProposalIds.push(propId);

    // Submit proposal
    const submitReq = makeReq(
      'POST',
      `/api/acquisition-proposals/${propId}/submit`,
      agencyOfficerCookie,
      { remarks: `Initial submission ${suffix}` }
    );
    const submitRes = await submitProposalHandler(submitReq, {
      params: Promise.resolve({ id: propId }),
    });
    const submitData = await submitRes.json();
    assert.strictEqual(submitRes.status, 200, `Failed to submit proposal: ${JSON.stringify(submitData)}`);
    assert.strictEqual(submitData.data.currentStatus, 'SUBMITTED');

    return propId;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Scrutiny Review Initiation
  // ─────────────────────────────────────────────────────────────────────────────
  it('1.1 should allow assigned Competent Authority user to transition proposal from SUBMITTED to UNDER_REVIEW', async () => {
    const propId = await createAndSubmitTestProposal('1-1');

    const req = makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, assignedCaUserCookie);
    const res = await startReviewHandler(req, {
      params: Promise.resolve({ id: propId }),
    });
    const json = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.currentStatus, 'UNDER_REVIEW');
    assert.strictEqual(json.data.id, propId);

    // Verify DB
    const [p] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, propId));
    assert.strictEqual(p.status, 'UNDER_REVIEW');

    const history = await db
      .select()
      .from(acquisitionProposalWorkflowHistory)
      .where(eq(acquisitionProposalWorkflowHistory.proposalId, propId));
    const startReviewAction = history.find((h) => h.action === 'START_REVIEW');
    assert.ok(startReviewAction, 'START_REVIEW action should be recorded in workflow history');
    assert.strictEqual(startReviewAction.toStatus, 'UNDER_REVIEW');
  });

  it('1.2 should reject start-review if called by unassigned CA officer (403 Forbidden)', async () => {
    const propId = await createAndSubmitTestProposal('1-2');

    const req = makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, unassignedCaUserCookie);
    const res = await startReviewHandler(req, {
      params: Promise.resolve({ id: propId }),
    });
    const json = await res.json();

    assert.strictEqual(res.status, 403);
    assert.strictEqual(json.success, false);
    assert.match(json.error, /not actively assigned/i);
  });

  it('1.3 should reject start-review if called by Implementing Agency officer (403 Forbidden)', async () => {
    const propId = await createAndSubmitTestProposal('1-3');

    const req = makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, agencyOfficerCookie);
    const res = await startReviewHandler(req, {
      params: Promise.resolve({ id: propId }),
    });
    const json = await res.json();

    assert.strictEqual(res.status, 403);
    assert.strictEqual(json.success, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Structured Scrutiny Observations
  // ─────────────────────────────────────────────────────────────────────────────
  it('2.1 should allow assigned CA user to record observations across supported categories', async () => {
    const propId = await createAndSubmitTestProposal('2-1');

    // Observation 1: LAND_REQUIREMENT
    const obs1Req = makeReq('POST', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie, {
      observationCategory: 'LAND_REQUIREMENT',
      observationTitle: 'Discrepancy in Proposed vs Recorded Affected Area',
      observationDescription:
        'Proposed affected area of 2000 sq m requires justification regarding alignment with project ROW.',
      relatedSection: 'Land Requirement Details',
    });
    const obs1Res = await createObservationHandler(obs1Req, {
      params: Promise.resolve({ id: propId }),
    });
    const obs1Json = await obs1Res.json();

    assert.strictEqual(obs1Res.status, 201);
    assert.strictEqual(obs1Json.success, true);
    assert.strictEqual(obs1Json.data.observationCategory, 'LAND_REQUIREMENT');
    assert.strictEqual(obs1Json.data.observationTitle, 'Discrepancy in Proposed vs Recorded Affected Area');
    assert.strictEqual(obs1Json.data.createdBy, assignedCaUserId);

    // Auto-transition check: status should automatically transition to UNDER_REVIEW
    const [ver] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, propId));
    assert.strictEqual(ver.status, 'UNDER_REVIEW', 'Adding observation should auto-transition SUBMITTED to UNDER_REVIEW');

    // Observation 2: DOCUMENTATION
    const obs2Req = makeReq('POST', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie, {
      observationCategory: 'DOCUMENTATION',
      observationTitle: 'Administrative Approval Letter Incomplete',
      observationDescription: 'Government administrative sanction reference letter annexure 2 is missing.',
      relatedSection: 'Supporting Documents',
    });
    const obs2Res = await createObservationHandler(obs2Req, {
      params: Promise.resolve({ id: propId }),
    });
    assert.strictEqual(obs2Res.status, 201);

    // Fetch observations list via GET
    const listReq = makeReq('GET', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie);
    const listRes = await listObservationsHandler(listReq, {
      params: Promise.resolve({ id: propId }),
    });
    const listJson = await listRes.json();

    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listJson.success, true);
    assert.strictEqual(listJson.data.length, 2);
  });

  it('2.2 should reject invalid observation category with 400 Bad Request', async () => {
    const propId = await createAndSubmitTestProposal('2-2');

    const req = makeReq('POST', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie, {
      observationCategory: 'INVALID_CATEGORY_TEST',
      observationTitle: 'Test title',
      observationDescription: 'Test description text here.',
    });
    const res = await createObservationHandler(req, {
      params: Promise.resolve({ id: propId }),
    });
    const json = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(json.success, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Review Decision: CORRECTION_REQUESTED & Revision Workflow
  // ─────────────────────────────────────────────────────────────────────────────
  it('3.1 should record CORRECTION_REQUESTED decision and allow Implementing Agency to Make Changes (v2)', async () => {
    const propId = await createAndSubmitTestProposal('3-1');

    // CA adds observation first
    await createObservationHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie, {
        observationCategory: 'FINANCIAL_INFORMATION',
        observationTitle: 'Clarification on Compensation Budget Provision',
        observationDescription: 'Budget estimate needs sanction from competent financial department.',
      }),
      { params: Promise.resolve({ id: propId }) }
    );

    // CA records decision: CORRECTION_REQUESTED
    const decReq = makeReq('POST', `/api/acquisition-proposals/${propId}/decisions`, assignedCaUserCookie, {
      decisionType: 'CORRECTION_REQUESTED',
      decisionRemarks:
        'Please address the financial sanction observations and re-upload the revised administrative approval.',
    });
    const decRes = await recordDecisionHandler(decReq, {
      params: Promise.resolve({ id: propId }),
    });
    const decJson = await decRes.json();

    assert.strictEqual(decRes.status, 200);
    assert.strictEqual(decJson.success, true);
    assert.strictEqual(decJson.decision.decisionType, 'CORRECTION_REQUESTED');
    assert.strictEqual(decJson.data.currentStatus, 'CORRECTION_REQUESTED');

    // Verify DB state
    const [v1] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, propId));
    assert.strictEqual(v1.status, 'CORRECTION_REQUESTED');
    assert.strictEqual(v1.reviewedBy, assignedCaUserId);
    assert.ok(v1.reviewedAt);

    // Verify decision record
    const [dec] = await db
      .select()
      .from(proposalScrutinyDecisions)
      .where(eq(proposalScrutinyDecisions.proposalId, propId));
    assert.strictEqual(dec.decisionType, 'CORRECTION_REQUESTED');
    assert.strictEqual(dec.decidedBy, assignedCaUserId);
    assert.strictEqual(dec.competentAuthorityId, authorityId);

    // Step 3C Workflow Integration: Implementing Agency initializes next draft version (Make Changes)
    const newVerReq = makeReq('POST', `/api/acquisition-proposals/${propId}/versions`, agencyOfficerCookie, {
      remarks: 'Initializing Version 2 to address financial sanction observations.',
    });
    const newVerRes = await createVersionHandler(newVerReq, {
      params: Promise.resolve({ id: propId }),
    });
    const newVerJson = await newVerRes.json();

    assert.strictEqual(newVerRes.status, 201);
    assert.strictEqual(newVerJson.success, true);
    assert.strictEqual(newVerJson.data.currentVersionNumber, 2);
    assert.strictEqual(newVerJson.data.currentStatus, 'DRAFT');

    // Verify Version 1 is preserved immutably and Version 2 is editable draft
    const allVersions = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, propId));
    assert.strictEqual(allVersions.length, 2);

    const ver1 = allVersions.find((v) => v.versionNumber === 1);
    const ver2 = allVersions.find((v) => v.versionNumber === 2);
    assert.strictEqual(ver1?.status, 'CORRECTION_REQUESTED');
    assert.strictEqual(ver2?.status, 'DRAFT');

    // Resubmit Version 2
    const resubmitReq = makeReq('POST', `/api/acquisition-proposals/${propId}/submit`, agencyOfficerCookie, {
      remarks: 'Resubmitting Version 2 with updated financial sanction.',
    });
    const resubmitRes = await submitProposalHandler(resubmitReq, {
      params: Promise.resolve({ id: propId }),
    });
    const resubmitJson = await resubmitRes.json();
    assert.strictEqual(resubmitRes.status, 200);
    assert.strictEqual(resubmitJson.data.currentStatus, 'SUBMITTED');
    assert.strictEqual(resubmitJson.data.currentVersionNumber, 2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Review Decision: APPROVED
  // ─────────────────────────────────────────────────────────────────────────────
  it('4.1 should record APPROVED decision when proposal is satisfactory and enforce concurrency idempotency', async () => {
    const propId = await createAndSubmitTestProposal('4-1');

    // Start scrutiny
    await startReviewHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, assignedCaUserCookie),
      { params: Promise.resolve({ id: propId }) }
    );

    // Record decision: APPROVED
    const approveReq = makeReq('POST', `/api/acquisition-proposals/${propId}/decisions`, assignedCaUserCookie, {
      decisionType: 'APPROVED',
      decisionRemarks:
        'Proposal is thoroughly scrutinized and approved to proceed to the next applicable stage in the acquisition process.',
    });
    const approveRes = await recordDecisionHandler(approveReq, {
      params: Promise.resolve({ id: propId }),
    });
    const approveJson = await approveRes.json();

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveJson.success, true);
    assert.strictEqual(approveJson.decision.decisionType, 'APPROVED');
    assert.strictEqual(approveJson.data.currentStatus, 'APPROVED');

    // Verify DB
    const [ver] = await db
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, propId));
    assert.strictEqual(ver.status, 'APPROVED');
    assert.strictEqual(ver.reviewedBy, assignedCaUserId);

    // Concurrency / Duplicate decision check: Attempting to record another decision on the same version must fail (409)
    const duplicateReq = makeReq('POST', `/api/acquisition-proposals/${propId}/decisions`, assignedCaUserCookie, {
      decisionType: 'APPROVED',
      decisionRemarks: 'Duplicate decision attempt on already approved version.',
    });
    const duplicateRes = await recordDecisionHandler(duplicateReq, {
      params: Promise.resolve({ id: propId }),
    });
    const duplicateJson = await duplicateRes.json();

    assert.strictEqual(duplicateRes.status, 409);
    assert.strictEqual(duplicateJson.success, false);
    assert.match(duplicateJson.error, /already has a decision recorded/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Review Decision: REJECTED (Terminal State)
  // ─────────────────────────────────────────────────────────────────────────────
  it('5.1 should record REJECTED decision and disallow subsequent draft initialization', async () => {
    const propId = await createAndSubmitTestProposal('5-1');

    // Start scrutiny
    await startReviewHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, assignedCaUserCookie),
      { params: Promise.resolve({ id: propId }) }
    );

    // Record decision: REJECTED
    const rejectReq = makeReq('POST', `/api/acquisition-proposals/${propId}/decisions`, assignedCaUserCookie, {
      decisionType: 'REJECTED',
      decisionRemarks:
        'Proposal rejected due to severe statutory non-compliance regarding environmental buffer zone encroachment.',
    });
    const rejectRes = await recordDecisionHandler(rejectReq, {
      params: Promise.resolve({ id: propId }),
    });
    const rejectJson = await rejectRes.json();

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectJson.success, true);
    assert.strictEqual(rejectJson.decision.decisionType, 'REJECTED');
    assert.strictEqual(rejectJson.data.currentStatus, 'REJECTED');

    // Attempting to create a new draft version on a REJECTED proposal must fail
    const newVerReq = makeReq('POST', `/api/acquisition-proposals/${propId}/versions`, agencyOfficerCookie, {
      remarks: 'Attempting to create version on rejected proposal',
    });
    const newVerRes = await createVersionHandler(newVerReq, {
      params: Promise.resolve({ id: propId }),
    });
    const newVerJson = await newVerRes.json();

    assert.strictEqual(newVerRes.status, 400);
    assert.strictEqual(newVerJson.success, false);
    assert.match(newVerJson.error, /CORRECTION_REQUESTED/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Chronological History Timeline & Ministry Read-Only Monitoring
  // ─────────────────────────────────────────────────────────────────────────────
  it('6.1 should provide complete unified chronological history timeline for Ministry monitoring', async () => {
    const propId = await createAndSubmitTestProposal('6-1');

    // Start review and add observation
    await startReviewHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/start-review`, assignedCaUserCookie),
      { params: Promise.resolve({ id: propId }) }
    );
    await createObservationHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/observations`, assignedCaUserCookie, {
        observationCategory: 'PROJECT_JUSTIFICATION',
        observationTitle: 'Public interest verification note',
        observationDescription: 'Public purpose is well articulated and justified.',
      }),
      { params: Promise.resolve({ id: propId }) }
    );

    // Approve
    await recordDecisionHandler(
      makeReq('POST', `/api/acquisition-proposals/${propId}/decisions`, assignedCaUserCookie, {
        decisionType: 'APPROVED',
        decisionRemarks: 'Approved following scrutiny.',
      }),
      { params: Promise.resolve({ id: propId }) }
    );

    // Ministry Officer monitors history via GET /api/acquisition-proposals/[id]/history
    const historyReq = makeReq('GET', `/api/acquisition-proposals/${propId}/history`, ministryAdminCookie);
    const historyRes = await getHistoryHandler(historyReq, {
      params: Promise.resolve({ id: propId }),
    });
    const historyJson = await historyRes.json();

    assert.strictEqual(historyRes.status, 200);
    assert.strictEqual(historyJson.success, true);
    assert.ok(Array.isArray(historyJson.data.timeline));
    assert.ok(
      historyJson.data.timeline.length >= 3,
      'Timeline must include versions, workflow events, observations, and decisions'
    );

    // Check item types in timeline
    const types = historyJson.data.timeline.map((t: any) => t.type);
    assert.ok(types.includes('WORKFLOW_ACTION'));
    assert.ok(types.includes('OBSERVATION'));
    assert.ok(types.includes('DECISION'));

    // Ministry Officer cannot record decisions (403 Forbidden)
    const unauthorizedDecisionReq = makeReq(
      'POST',
      `/api/acquisition-proposals/${propId}/decisions`,
      ministryAdminCookie,
      {
        decisionType: 'APPROVED',
        decisionRemarks: 'Unauthorized decision attempt by ministry user',
      }
    );
    const unauthorizedDecisionRes = await recordDecisionHandler(unauthorizedDecisionReq, {
      params: Promise.resolve({ id: propId }),
    });
    assert.strictEqual(unauthorizedDecisionRes.status, 403);
  });
});
