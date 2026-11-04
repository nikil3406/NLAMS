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
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../db/schema/field-verification-evidence';
import { fieldVerificationReportReviews } from '../../db/schema/field-verification-report-reviews';
import { parcelDiscrepancies } from '../../db/schema/parcel-discrepancies';
import { discrepancyInvestigations } from '../../db/schema/discrepancy-investigations';
import { discrepancyResolutionHistory } from '../../db/schema/discrepancy-resolution-history';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { GET as listDiscrepanciesHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/route';
import { GET as getDiscrepancyHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/route';
import { POST as startInvestigationHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/route';
import { PATCH as updateInvestigationHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/[investigationId]/route';
import { POST as attachEvidenceHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/[investigationId]/evidence/route';
import { POST as submitInvestigationHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/investigations/[investigationId]/submit/route';
import { POST as resolveDiscrepancyHandler } from '../../src/app/api/acquisition-cases/[id]/discrepancies/[discrepancyId]/resolve/route';
import { POST as reportReviewHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/review/route';
import { POST as reportSubmitHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/[reportId]/submit/route';
import { POST as reportCreateHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/reports/route';
import { GET as verificationSummaryHandler } from '../../src/app/api/acquisition-cases/[id]/verification-summary/route';

describe('NLAMS — Step 6: Discrepancy Investigation and Resolution Workflow', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];
  const createdReportIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  // KA Field Officer (Author & Investigator)
  let fieldOfficerAuthorId: string;
  let fieldOfficerAuthorCookie: string;

  // KA Field Officer 2 (Second Investigator)
  let fieldOfficerInvestigatorId: string;
  let fieldOfficerInvestigatorCookie: string;

  // KA Land Officer 1 (Reviewer & Resolver)
  let landOfficer1Id: string;
  let landOfficer1Cookie: string;

  // KA Land Officer 2 (Second Resolver)
  let landOfficer2Id: string;
  let landOfficer2Cookie: string;

  // MH Land Officer (Out-of-scope for KA cases)
  let mhLandOfficerId: string;
  let mhLandOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  let caseId: string;
  let parcel1Id: string;
  let caseParcel1Id: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found. Run seed first.');
    superAdminId = sa.id;

    // 2. Resolve Admin Units
    const [ka] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);
    unitIdKA = ka.id;

    const [mh] = await db
      .select({ id: administrativeUnits.id })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'MH'))
      .limit(1);
    unitIdMH = mh.id;

    // 3. Resolve Implementing Agency
    const [agency] = await db.select({ id: implementingAgencies.id }).from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 4. Resolve Roles
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

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

    superAdminCookie = await makeSession(superAdminId);

    // 1. KA Field Officer Author
    fieldOfficerAuthorId = await makeUser('KA FO Author', 'fo.author.step6');
    await assignRole(fieldOfficerAuthorId, foRole.id);
    await assignUnit(fieldOfficerAuthorId, unitIdKA);
    fieldOfficerAuthorCookie = await makeSession(fieldOfficerAuthorId);

    // 2. KA Field Officer Investigator
    fieldOfficerInvestigatorId = await makeUser('KA FO Investigator', 'fo.inv.step6');
    await assignRole(fieldOfficerInvestigatorId, foRole.id);
    await assignUnit(fieldOfficerInvestigatorId, unitIdKA);
    fieldOfficerInvestigatorCookie = await makeSession(fieldOfficerInvestigatorId);

    // 3. KA Land Officer 1
    landOfficer1Id = await makeUser('KA LO 1', 'lo.1.step6');
    await assignRole(landOfficer1Id, loRole.id);
    await assignUnit(landOfficer1Id, unitIdKA);
    landOfficer1Cookie = await makeSession(landOfficer1Id);

    // 4. KA Land Officer 2
    landOfficer2Id = await makeUser('KA LO 2', 'lo.2.step6');
    await assignRole(landOfficer2Id, loRole.id);
    await assignUnit(landOfficer2Id, unitIdKA);
    landOfficer2Cookie = await makeSession(landOfficer2Id);

    // 5. MH Land Officer (Out of Scope)
    mhLandOfficerId = await makeUser('MH LO', 'mh.lo.step6');
    await assignRole(mhLandOfficerId, loRole.id);
    await assignUnit(mhLandOfficerId, unitIdMH);
    mhLandOfficerCookie = await makeSession(mhLandOfficerId);

    // Create Project
    const [kaProj] = await db
      .insert(projects)
      .values({
        projectCode: `PRJ-6-KA-${ts}`,
        name: `Step 6 Project KA ${ts}`,
        projectType: 'METRO',
        status: 'REGISTERED',
        administrativeUnitId: unitIdKA,
        implementingAgencyId: agencyId,
        createdBy: superAdminId,
      })
      .returning({ id: projects.id });
    createdProjectIds.push(kaProj.id);

    // Create Acquisition Case in AWAITING_FIELD_VERIFICATION
    const [c] = await db
      .insert(acquisitionCases)
      .values({
        caseReference: `CASE-6-${ts}`,
        projectId: kaProj.id,
        title: `Step 6 Investigation Case ${ts}`,
        status: 'AWAITING_FIELD_VERIFICATION',
        createdBy: landOfficer1Id,
        updatedBy: landOfficer1Id,
      })
      .returning({ id: acquisitionCases.id });
    caseId = c.id;
    createdCaseIds.push(c.id);

    // Create Parcel
    const [p] = await db
      .insert(landParcels)
      .values({
        parcelId: `P-6-${ts}`,
        administrativeUnitId: unitIdKA,
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        taluk: 'Bengaluru North',
        village: 'Yelahanka',
        surveyNumber: '601',
        totalArea: '1500.0000',
        areaUnit: 'SQ_M',
        createdBy: superAdminId,
      })
      .returning({ id: landParcels.id });
    parcel1Id = p.id;
    createdParcelIds.push(p.id);

    // Link Parcel to Case
    const [cp] = await db
      .insert(acquisitionCaseParcels)
      .values({
        caseId,
        parcelId: parcel1Id,
        proposedAffectedArea: '800.0000',
        affectedAreaUnit: 'SQ_M',
        createdBy: landOfficer1Id,
      })
      .returning({ id: acquisitionCaseParcels.id });
    caseParcel1Id = cp.id;
    createdCaseParcelIds.push(cp.id);
  });

  after(async () => {
    // Cleanup created data
    if (caseId) {
      const discRows = await db
        .select({ id: parcelDiscrepancies.id })
        .from(parcelDiscrepancies)
        .where(eq(parcelDiscrepancies.caseId, caseId));
      const discIds = discRows.map((r) => r.id);
      if (discIds.length > 0) {
        await db.delete(discrepancyResolutionHistory).where(inArray(discrepancyResolutionHistory.discrepancyId, discIds));
        const invRows = await db
          .select({ id: discrepancyInvestigations.id })
          .from(discrepancyInvestigations)
          .where(inArray(discrepancyInvestigations.discrepancyId, discIds));
        const invIds = invRows.map((r) => r.id);
        if (invIds.length > 0) {
          await db.delete(fieldVerificationEvidence).where(inArray(fieldVerificationEvidence.investigationId, invIds));
          await db.delete(discrepancyInvestigations).where(inArray(discrepancyInvestigations.id, invIds));
        }
        await db.delete(parcelDiscrepancies).where(inArray(parcelDiscrepancies.id, discIds));
      }
    }

    if (createdReportIds.length > 0) {
      await db.delete(fieldVerificationReportReviews).where(inArray(fieldVerificationReportReviews.reportId, createdReportIds));
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

  function makeReq(
    method: string,
    url: string,
    cookie?: string,
    body?: Record<string, unknown>
  ): NextRequest {
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);
    if (body) headers.set('content-type', 'application/json');

    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Helper to create and submit a verification report
  async function createAndSubmitReport(outcome: 'VERIFIED' | 'DISCREPANCY_FOUND' | 'INCONCLUSIVE' = 'DISCREPANCY_FOUND'): Promise<string> {
    const createReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${caseParcel1Id}/reports`,
      fieldOfficerAuthorCookie,
      {
        verificationDate: new Date().toISOString(),
        outcome,
        observations: 'Discrepancy found during boundary peg survey.',
        measuredArea: 650.0,
        measuredAreaUnit: 'SQ_M',
        evidence: [
          {
            evidenceType: 'PHOTO',
            fileReference: `evid_${ts}_${Math.random().toString(36).slice(2, 7)}`,
            caption: 'Discrepancy peg photo',
          },
        ],
      }
    );
    const createRes = await reportCreateHandler(createReq, {
      params: Promise.resolve({ id: caseId, caseParcelId: caseParcel1Id }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    const rptId = createJson.data.id;
    createdReportIds.push(rptId);

    const submitReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${caseParcel1Id}/reports/${rptId}/submit`,
      fieldOfficerAuthorCookie,
      {}
    );
    const submitRes = await reportSubmitHandler(submitReq, {
      params: Promise.resolve({ id: caseId, caseParcelId: caseParcel1Id, reportId: rptId }),
    });
    assert.equal(submitRes.status, 200);
    return rptId;
  }

  // --------------------------------------------------------------------------
  // Category 1: Unauthenticated & Unauthorized Operations
  // --------------------------------------------------------------------------

  it('1. Unauthenticated operations return 401 Unauthorized', async () => {
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`);
    const res = await listDiscrepanciesHandler(req, { params: Promise.resolve({ id: caseId }) });
    assert.equal(res.status, 401);
  });

  it('2. Cross-jurisdiction out-of-scope access is rejected with 404/403', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies`,
      mhLandOfficerCookie
    );
    const res = await listDiscrepanciesHandler(req, { params: Promise.resolve({ id: caseId }) });
    assert.ok(res.status === 404 || res.status === 403, 'Cross-jurisdiction user must be denied access');
  });

  // --------------------------------------------------------------------------
  // Category 2: Discrepancy Creation from Step 5B Flag
  // --------------------------------------------------------------------------

  let flaggedDiscrepancyId: string;
  let triggeringReportId: string;

  it('3. Land Officer flagging report as DISCREPANCY_FLAGGED automatically creates formal discrepancy record', async () => {
    triggeringReportId = await createAndSubmitReport('DISCREPANCY_FOUND');

    const reviewReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/parcels/${caseParcel1Id}/reports/${triggeringReportId}/review`,
      landOfficer1Cookie,
      {
        decision: 'DISCREPANCY_FLAGGED',
        remarks: 'Significant boundary conflict observed with survey records.',
      }
    );
    const reviewRes = await reportReviewHandler(reviewReq, {
      params: Promise.resolve({ id: caseId, caseParcelId: caseParcel1Id, reportId: triggeringReportId }),
    });
    assert.equal(reviewRes.status, 200);

    // Verify formal discrepancy record was created in database
    const [disc] = await db
      .select()
      .from(parcelDiscrepancies)
      .where(eq(parcelDiscrepancies.reportId, triggeringReportId));

    assert.ok(disc, 'Formal discrepancy record must be created');
    assert.equal(disc.caseId, caseId);
    assert.equal(disc.caseParcelId, caseParcel1Id);
    assert.equal(disc.status, 'OPEN');
    assert.equal(disc.description, 'Significant boundary conflict observed with survey records.');
    assert.equal(disc.createdBy, landOfficer1Id);

    flaggedDiscrepancyId = disc.id;
  });

  it('4. Discrepancy retrieval via GET returns full details, parcel info, and triggering report', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}`,
      landOfficer1Cookie
    );
    const res = await getDiscrepancyHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.id, flaggedDiscrepancyId);
    assert.equal(json.data.parcel.surveyNumber, '601');
    assert.equal(json.data.report.id, triggeringReportId);
    assert.equal(json.data.status, 'OPEN');
  });

  // --------------------------------------------------------------------------
  // Category 3: Investigation Workflow (Start, Draft, Evidence, Submit)
  // --------------------------------------------------------------------------

  let investigationId: string;

  it('5. Field Officer starts an investigation, transitioning discrepancy to UNDER_INVESTIGATION', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations`,
      fieldOfficerInvestigatorCookie,
      { notes: 'Commencing boundary investigation and resurvey.' }
    );
    const res = await startInvestigationHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.discrepancy.status, 'UNDER_INVESTIGATION');
    assert.equal(json.data.investigation.status, 'DRAFT');
    assert.equal(json.data.investigation.investigatorId, fieldOfficerInvestigatorId);

    investigationId = json.data.investigation.id;
  });

  it('6. Non-investigator cannot modify another investigator draft findings (403 Forbidden)', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations/${investigationId}`,
      fieldOfficerAuthorCookie, // Author is not the assigned investigator
      { findings: 'Attempt to tamper findings.' }
    );
    const res = await updateInvestigationHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId, investigationId }),
    });
    assert.equal(res.status, 403);
  });

  it('7. Assigned investigator updates draft findings and notes', async () => {
    const req = makeReq(
      'PATCH',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations/${investigationId}`,
      fieldOfficerInvestigatorCookie,
      {
        findings: 'On-site resurvey shows northern boundary marker displaced by 4.2 meters.',
        notes: 'GPS survey conducted using differential GNSS equipment.',
      }
    );
    const res = await updateInvestigationHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId, investigationId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.match(json.data.findings, /northern boundary marker displaced/);
  });

  it('8. Investigator attaches evidence to investigation', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations/${investigationId}/evidence`,
      fieldOfficerInvestigatorCookie,
      {
        evidenceType: 'SKETCH',
        fileReference: `inv_sketch_${ts}.pdf`,
        caption: 'Resurvey overlaid boundary sketch',
      }
    );
    const res = await attachEvidenceHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId, investigationId }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.fileReference, `inv_sketch_${ts}.pdf`);
  });

  it('9. Submitting investigation transitions discrepancy to SUBMITTED_FOR_RESOLUTION', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations/${investigationId}/submit`,
      fieldOfficerInvestigatorCookie,
      {
        findings: 'Final verified findings: Boundary discrepancy confirmed. The affected area is 650 sq m instead of proposed 800 sq m.',
      }
    );
    const res = await submitInvestigationHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId, investigationId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.discrepancy.status, 'SUBMITTED_FOR_RESOLUTION');
    assert.equal(json.data.investigation.status, 'SUBMITTED');
  });

  // --------------------------------------------------------------------------
  // Category 4: Resolution & Separation of Duties
  // --------------------------------------------------------------------------

  it('10. Separation of duties: Investigator CANNOT resolve their own investigation (403 Forbidden)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/resolve`,
      fieldOfficerInvestigatorCookie, // Investigator attempts self-approval
      {
        decision: 'RESOLVED',
        remarks: 'Self approval attempt.',
      }
    );
    const res = await resolveDiscrepancyHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 403, 'Investigator must be denied resolution privilege');
  });

  it('11. Resolution requires mandatory remarks (min 5 characters)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/resolve`,
      landOfficer1Cookie,
      {
        decision: 'RESOLVED',
        remarks: 'ok', // too short
      }
    );
    const res = await resolveDiscrepancyHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 400);
  });

  it('12. Returning investigation for further investigation transitions status back to UNDER_INVESTIGATION', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/resolve`,
      landOfficer1Cookie,
      {
        decision: 'RETURNED_FOR_FURTHER_INVESTIGATION',
        remarks: 'Please obtain official village survey map certification from the revenue office.',
      }
    );
    const res = await resolveDiscrepancyHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.status, 'UNDER_INVESTIGATION');
  });

  it('13. Re-submitting investigation after return and resolving successfully', async () => {
    // Start second investigation iteration
    const startReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations`,
      fieldOfficerInvestigatorCookie,
      { notes: 'Second iteration: Attaching revenue office certified village survey sheet.' }
    );
    const startRes = await startInvestigationHandler(startReq, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(startRes.status, 201);
    const startJson = await startRes.json();
    const inv2Id = startJson.data.investigation.id;

    // Submit second investigation
    const subReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/investigations/${inv2Id}/submit`,
      fieldOfficerInvestigatorCookie,
      {
        findings: 'Revenue office certified village survey map attached. Measurement reconciled with adjoining parcel owners.',
      }
    );
    const subRes = await submitInvestigationHandler(subReq, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId, investigationId: inv2Id }),
    });
    assert.equal(subRes.status, 200);

    // Land Officer 2 resolves the discrepancy
    const resReq = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/resolve`,
      landOfficer2Cookie,
      {
        decision: 'RESOLVED',
        remarks: 'Discrepancy formally resolved based on official revenue survey map certification.',
      }
    );
    const resRes = await resolveDiscrepancyHandler(resReq, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(resRes.status, 200);
    const resJson = await resRes.json();
    assert.equal(resJson.data.status, 'RESOLVED');

    // Verify resolution history has both decisions
    assert.equal(resJson.data.resolutionHistory.length, 2);
  });

  // --------------------------------------------------------------------------
  // Category 5: Concurrency & Case Summary Metrics
  // --------------------------------------------------------------------------

  it('14. Cannot resolve a discrepancy that is already RESOLVED (409 Conflict)', async () => {
    const req = makeReq(
      'POST',
      `http://localhost:3000/api/acquisition-cases/${caseId}/discrepancies/${flaggedDiscrepancyId}/resolve`,
      landOfficer1Cookie,
      {
        decision: 'RESOLVED',
        remarks: 'Redundant resolution attempt.',
      }
    );
    const res = await resolveDiscrepancyHandler(req, {
      params: Promise.resolve({ id: caseId, discrepancyId: flaggedDiscrepancyId }),
    });
    assert.equal(res.status, 409);
  });

  it('15. Case verification summary reflects formal discrepancy counts', async () => {
    const req = makeReq(
      'GET',
      `http://localhost:3000/api/acquisition-cases/${caseId}/verification-summary`,
      landOfficer1Cookie
    );
    const res = await verificationSummaryHandler(req, {
      params: Promise.resolve({ id: caseId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.data.discrepanciesSummary, 'Case verification summary must include discrepanciesSummary');
    assert.equal(json.data.discrepanciesSummary.totalDiscrepancies, 1);
    assert.equal(json.data.discrepanciesSummary.resolvedDiscrepancies, 1);
  });

  it('16. Acquisition case status remains AWAITING_FIELD_VERIFICATION (no automatic completion)', async () => {
    const [c] = await db
      .select({ status: acquisitionCases.status })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, caseId))
      .limit(1);

    assert.equal(
      c.status,
      'AWAITING_FIELD_VERIFICATION',
      'Case status must remain in AWAITING_FIELD_VERIFICATION and not be automatically completed'
    );
  });
});
