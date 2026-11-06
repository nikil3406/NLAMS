import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
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
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';
import {
  GET as getCompletionHandler,
  POST as postCompletionHandler,
} from '../../src/app/api/acquisition-cases/[id]/verification-completion/route';

describe('NLAMS — Step 7: Field Verification Completion Workflow', () => {
  const ts = Date.now();

  let superAdminId: string;
  let superAdminCookie: string;

  let verifiedLandOfficerId: string;
  let verifiedLandOfficerCookie: string;

  let unverifiedLandOfficerId: string; // Active LO with NO administrative unit assignment
  let unverifiedLandOfficerCookie: string;

  let inactiveLandOfficerId: string; // INACTIVE LO
  let inactiveLandOfficerCookie: string;

  let outOfScopeLandOfficerId: string; // MH LO (case in KA)
  let outOfScopeLandOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let projectOfficerId: string;
  let projectOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;
  let projectId: string;

  let baseCaseId: string;
  let caseParcel1Id: string;
  let caseParcel2Id: string;
  let parcel1Id: string;
  let parcel2Id: string;

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
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
    const [saRole] = await db.select().from(roles).where(eq(roles.name, 'SUPER_ADMIN')).limit(1);
    const [saUser] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, saRole.id))
      .limit(1);
    superAdminId = saUser.id;

    // 2. Resolve Administrative Units
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    unitIdKA = ka.id;

    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitIdMH = mh.id;

    // 3. Resolve Agency
    const [agency] = await db.select().from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 4. Resolve Roles
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);
    const [poRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const makeUser = async (nameSuffix: string, emailPrefix: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') => {
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

    // Verified Land Officer (KA assignment)
    verifiedLandOfficerId = await makeUser('Verified LO', 'verified.lo');
    await db.insert(userRoles).values({ userId: verifiedLandOfficerId, roleId: loRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: verifiedLandOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    verifiedLandOfficerCookie = await makeSession(verifiedLandOfficerId);

    // Unverified Land Officer (Active user, LO role, NO unit assignment)
    unverifiedLandOfficerId = await makeUser('Unverified LO', 'unverified.lo');
    await db.insert(userRoles).values({ userId: unverifiedLandOfficerId, roleId: loRole.id, assignedBy: superAdminId });
    unverifiedLandOfficerCookie = await makeSession(unverifiedLandOfficerId);

    // Inactive Land Officer (INACTIVE status, LO role, KA assignment)
    inactiveLandOfficerId = await makeUser('Inactive LO', 'inactive.lo', 'INACTIVE');
    await db.insert(userRoles).values({ userId: inactiveLandOfficerId, roleId: loRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: inactiveLandOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    inactiveLandOfficerCookie = await makeSession(inactiveLandOfficerId);

    // Out of scope Land Officer (MH assignment)
    outOfScopeLandOfficerId = await makeUser('MH LO Out of Scope', 'mh.lo.scope');
    await db.insert(userRoles).values({ userId: outOfScopeLandOfficerId, roleId: loRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: outOfScopeLandOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    outOfScopeLandOfficerCookie = await makeSession(outOfScopeLandOfficerId);

    // Field Officer
    fieldOfficerId = await makeUser('KA FO', 'fo.officer');
    await db.insert(userRoles).values({ userId: fieldOfficerId, roleId: foRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: fieldOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    fieldOfficerCookie = await makeSession(fieldOfficerId);

    // Project Officer
    projectOfficerId = await makeUser('KA PO', 'po.officer');
    await db.insert(userRoles).values({ userId: projectOfficerId, roleId: poRole.id, assignedBy: superAdminId });
    await db.insert(userAssignments).values({
      userId: projectOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    projectOfficerCookie = await makeSession(projectOfficerId);

    // Create Base Project (KA)
    const [proj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-STEP7-${ts}`,
        name: `Step 7 Project ${ts}`,
        projectType: 'METRO',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    projectId = proj.id;
    createdProjectIds.push(projectId);
  });

  after(async () => {
    // Clean up created records in reverse order
    try {
      if (createdDiscrepancyIds.length > 0) {
        await db.execute(sql`DELETE FROM discrepancy_resolution_history WHERE discrepancy_id = ANY(${createdDiscrepancyIds}::uuid[])`);
        await db.execute(sql`DELETE FROM discrepancy_investigations WHERE discrepancy_id = ANY(${createdDiscrepancyIds}::uuid[])`);
        await db.execute(sql`DELETE FROM parcel_discrepancies WHERE id = ANY(${createdDiscrepancyIds}::uuid[])`);
      }
      if (createdReportIds.length > 0) {
        await db.execute(sql`DELETE FROM field_verification_report_reviews WHERE report_id = ANY(${createdReportIds}::uuid[])`);
        await db.execute(sql`DELETE FROM field_verification_evidence WHERE report_id = ANY(${createdReportIds}::uuid[])`);
        await db.execute(sql`DELETE FROM field_verification_reports WHERE id = ANY(${createdReportIds}::uuid[])`);
      }
      if (createdCaseParcelIds.length > 0) {
        await db.execute(sql`DELETE FROM acquisition_case_parcels WHERE id = ANY(${createdCaseParcelIds}::uuid[])`);
      }
      if (createdParcelIds.length > 0) {
        await db.execute(sql`DELETE FROM land_parcels WHERE id = ANY(${createdParcelIds}::uuid[])`);
      }
      if (createdCaseIds.length > 0) {
        await db.execute(sql`DELETE FROM acquisition_case_workflow_history WHERE case_id = ANY(${createdCaseIds}::uuid[])`);
        await db.execute(sql`DELETE FROM acquisition_cases WHERE id = ANY(${createdCaseIds}::uuid[])`);
      }
      if (createdProjectIds.length > 0) {
        await db.execute(sql`DELETE FROM projects WHERE id = ANY(${createdProjectIds}::uuid[])`);
      }
      if (createdUserIds.length > 0) {
        await db.execute(sql`DELETE FROM user_assignments WHERE user_id = ANY(${createdUserIds}::uuid[])`);
        await db.execute(sql`DELETE FROM user_roles WHERE user_id = ANY(${createdUserIds}::uuid[])`);
        await db.execute(sql`DELETE FROM sessions WHERE user_id = ANY(${createdUserIds}::uuid[])`);
        await db.execute(sql`DELETE FROM users WHERE id = ANY(${createdUserIds}::uuid[])`);
      }
    } catch {
      // Best-effort cleanup
    }
  });

  // Helper to create a new case in specified status
  const createCase = async (status: any = 'AWAITING_FIELD_VERIFICATION') => {
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-S7-${Math.random().toString(36).substring(2, 9)}`,
        projectId,
        title: `Step 7 Case ${ts}`,
        status,
        createdBy: verifiedLandOfficerId,
        updatedBy: verifiedLandOfficerId,
      })
      .returning({ id: acquisitionCases.id });
    createdCaseIds.push(c.id);
    return c.id;
  };

  // Helper to attach a parcel to a case
  const attachParcel = async (caseId: string, survey: string) => {
    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-${survey}-${ts}`,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: survey,
        totalArea: '1000.0000',
        areaUnit: 'SQ_M',
        createdBy: superAdminId,
      })
      .returning({ id: landParcels.id });
    createdParcelIds.push(p.id);

    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId,
        parcelId: p.id,
        proposedAffectedArea: '500.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: verifiedLandOfficerId,
      })
      .returning({ id: acquisitionCaseParcels.id });
    createdCaseParcelIds.push(cp.id);
    return { parcelId: p.id, caseParcelId: cp.id };
  };

  // Helper to attach an accepted report with evidence & review
  const attachAcceptedReport = async (
    caseParcelId: string,
    options: {
      outcome?: 'VERIFIED' | 'DISCREPANCY_FOUND' | 'INCONCLUSIVE';
      withEvidence?: boolean;
      withAudit?: boolean;
      reviewerId?: string;
      status?: 'ACCEPTED' | 'SUBMITTED' | 'DRAFT';
    } = {}
  ) => {
    const status = options.status ?? 'ACCEPTED';
    const outcome = options.outcome ?? 'VERIFIED';
    const reviewerId = options.reviewerId ?? verifiedLandOfficerId;

    const [rpt] = await db
      .insert(fieldVerificationReports)
      .values({
        caseParcelId,
        verifiedBy: fieldOfficerId,
        verificationDate: new Date(),
        outcome,
        observations: 'Satisfactory inspection',
        measuredArea: '500.0000',
        measuredAreaUnit: 'SQ_M',
        status,
        submittedAt: new Date(),
        reviewedBy: status === 'ACCEPTED' ? reviewerId : null,
        reviewedAt: status === 'ACCEPTED' ? new Date() : null,
        reviewDecision: status === 'ACCEPTED' ? 'ACCEPTED' : null,
        createdBy: fieldOfficerId,
      })
      .returning({ id: fieldVerificationReports.id });
    createdReportIds.push(rpt.id);

    if (options.withEvidence !== false) {
      await db.insert(fieldVerificationEvidence).values({
        reportId: rpt.id,
        evidenceType: 'PHOTO',
        fileReference: `evid_${rpt.id}`,
        caption: 'Survey photo',
        createdBy: fieldOfficerId,
      });
    }

    if (status === 'ACCEPTED' && options.withAudit !== false) {
      await db.insert(fieldVerificationReportReviews).values({
        reportId: rpt.id,
        reviewerId,
        decision: 'ACCEPTED',
        fromStatus: 'SUBMITTED',
        toStatus: 'ACCEPTED',
        remarks: 'Verification approved',
      });
    }

    return rpt.id;
  };

  // ==========================================================================
  // TESTS
  // ==========================================================================

  it('1. All conditions satisfied: Case transitions to FIELD_VERIFICATION_COMPLETED', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '701');
    const { caseParcelId: cp2 } = await attachParcel(caseId, '702');

    await attachAcceptedReport(cp1);
    await attachAcceptedReport(cp2);

    // Check eligibility
    const getReq = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const getRes = await getCompletionHandler(getReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.data.isEligible, true);
    assert.equal(getJson.data.acceptedParcels, 2);
    assert.equal(getJson.data.totalRequiredParcels, 2);

    // Complete verification
    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie, {
      remarks: 'All 2 parcels verified and approved.',
    });
    const postRes = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(postRes.status, 200);
    const postJson = await postRes.json();
    assert.equal(postJson.data.status, 'FIELD_VERIFICATION_COMPLETED');

    // Verify DB case status
    const [updatedCase] = await db.select().from(acquisitionCases).where(eq(acquisitionCases.id, caseId));
    assert.equal(updatedCase.status, 'FIELD_VERIFICATION_COMPLETED');

    // Verify workflow history audit
    const history = await db.select().from(acquisitionCaseWorkflowHistory).where(eq(acquisitionCaseWorkflowHistory.caseId, caseId));
    assert.ok(history.some((h) => h.toStatus === 'FIELD_VERIFICATION_COMPLETED' && h.action === 'COMPLETE_FIELD_VERIFICATION'));
  });

  it('2. Parcel without an accepted report prevents completion (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '703');
    await attachParcel(caseId, '704'); // No report attached

    await attachAcceptedReport(cp1);

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /no field verification reports/i);
  });

  it('3. Report awaiting review prevents completion (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '705');

    // Attach report in SUBMITTED status (awaiting LO review)
    await attachAcceptedReport(cp1, { status: 'SUBMITTED' });

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /report awaiting review|not accepted/i);
  });

  it('4. Inconclusive report outcome prevents completion (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '706');

    // Accepted report but outcome is INCONCLUSIVE
    await attachAcceptedReport(cp1, { outcome: 'INCONCLUSIVE' });

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /inconclusive/i);
  });

  it('5. Unresolved discrepancy prevents completion (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '707');
    const rptId = await attachAcceptedReport(cp1);

    // Create an OPEN discrepancy linked to this case
    const [disc] = await db
      .insert(parcelDiscrepancies)
      .values({
        caseId,
        caseParcelId: cp1,
        reportId: rptId,
        category: 'AREA_MISMATCH',
        description: 'Significant boundary conflict noted',
        status: 'OPEN',
        createdBy: verifiedLandOfficerId,
      })
      .returning({ id: parcelDiscrepancies.id });
    createdDiscrepancyIds.push(disc.id);

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /not resolved/i);
  });

  it('6. Authorized exception must NOT count as a resolved discrepancy (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '708');
    const rptId = await attachAcceptedReport(cp1);

    // Create discrepancy resolved via administrative exception
    const [disc] = await db
      .insert(parcelDiscrepancies)
      .values({
        caseId,
        caseParcelId: cp1,
        reportId: rptId,
        category: 'BOUNDARY_MISMATCH',
        description: 'Encroachment observed',
        status: 'RESOLVED',
        createdBy: verifiedLandOfficerId,
      })
      .returning({ id: parcelDiscrepancies.id });
    createdDiscrepancyIds.push(disc.id);

    // Decision record remarks clearly indicate an administrative exception
    await db.insert(discrepancyResolutionHistory).values({
      discrepancyId: disc.id,
      decision: 'RESOLVED',
      remarks: 'Discrepancy waived via administrative exception order #402',
      resolvedBy: superAdminId,
    });

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /exception/i);
  });

  it('7. Missing evidence prevents completion (409 Conflict)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '709');

    // Report accepted but has NO evidence attached
    await attachAcceptedReport(cp1, { withEvidence: false });

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(postReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.match(json.error, /no attached evidence/i);
  });

  it('8. Unauthorized roles cannot complete field verification (403 Forbidden)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '710');
    await attachAcceptedReport(cp1);

    // FIELD_OFFICER attempt
    const foReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, fieldOfficerCookie);
    const foRes = await postCompletionHandler(foReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(foRes.status, 403);

    // PROJECT_OFFICER attempt
    const poReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, projectOfficerCookie);
    const poRes = await postCompletionHandler(poReq, { params: Promise.resolve({ id: caseId }) });
    assert.equal(poRes.status, 403);
  });

  it('9. Unverified Land Officer (no active unit assignment) cannot complete verification (403 Forbidden)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '711');
    await attachAcceptedReport(cp1);

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, unverifiedLandOfficerCookie);
    const res = await postCompletionHandler(req, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /unverified status|no active administrative unit assignment/i);
  });

  it('10. Inactive Land Officer cannot complete verification (401 Unauthorized)', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '712');
    await attachAcceptedReport(cp1);

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, inactiveLandOfficerCookie);
    const res = await postCompletionHandler(req, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.match(json.error, /Unauthorized/i);
  });

  it('11. Out-of-scope Land Officer cannot complete verification (403 Forbidden)', async () => {
    const caseId = await createCase(); // Case is in KA
    const { caseParcelId: cp1 } = await attachParcel(caseId, '713');
    await attachAcceptedReport(cp1);

    // Officer assigned to MH attempts KA case
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, outOfScopeLandOfficerCookie);
    const res = await postCompletionHandler(req, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /administrative scope/i);
  });

  it('12. Duplicate completion request rejects with 409 Conflict', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '714');
    await attachAcceptedReport(cp1);

    // First completion succeeds
    const req1 = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res1 = await postCompletionHandler(req1, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res1.status, 200);

    // Second duplicate request
    const req2 = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie);
    const res2 = await postCompletionHandler(req2, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res2.status, 409);
    const json = await res2.json();
    assert.match(json.error, /already been completed/i);
  });

  it('13. Concurrent completion attempts: exactly one succeeds, conflicting rejected with 409', async () => {
    const caseId = await createCase();
    const { caseParcelId: cp1 } = await attachParcel(caseId, '715');
    await attachAcceptedReport(cp1);

    // Send two concurrent completion requests
    const [resA, resB] = await Promise.all([
      postCompletionHandler(
        makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie, { remarks: 'Concurrent attempt A' }),
        { params: Promise.resolve({ id: caseId }) }
      ),
      postCompletionHandler(
        makeReq('POST', `http://localhost:3000/api/acquisition-cases/${caseId}/verification-completion`, verifiedLandOfficerCookie, { remarks: 'Concurrent attempt B' }),
        { params: Promise.resolve({ id: caseId }) }
      ),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Exactly one concurrent completion must succeed and the other must be rejected');
  });

  it('14. Invalid case status transition prevents completion (400 Bad Request)', async () => {
    // Case in DRAFT status
    const draftCaseId = await createCase('DRAFT');
    const { caseParcelId: cp1 } = await attachParcel(draftCaseId, '716');
    await attachAcceptedReport(cp1);

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${draftCaseId}/verification-completion`, verifiedLandOfficerCookie);
    const res = await postCompletionHandler(req, { params: Promise.resolve({ id: draftCaseId }) });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /DRAFT/i);
  });
});
