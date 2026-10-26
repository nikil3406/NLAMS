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
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { GET as parcelsGetHandler, POST as parcelsPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/route';
import { GET as parcelDetailGetHandler, PATCH as parcelDetailPatchHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/route';

describe('NLAMS — Step 2: Parcel API and Authorization', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  // KA Users
  let projOfficerId: string;
  let projOfficerCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  // MH User (different state/scope)
  let mhFieldOfficerId: string;
  let mhFieldOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let agencyId: string;

  // Test acquisition cases
  let draftCaseId: string;
  let submittedCaseId: string;
  let awaitingVerifCaseId: string;
  let mhAwaitingVerifCaseId: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found. Run seed first.');
    superAdminId = sa.id;

    // 2. Resolve Administrative Units
    const [ka] = await db.select({ id: administrativeUnits.id }).from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    unitIdKA = ka.id;

    const [mh] = await db.select({ id: administrativeUnits.id }).from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitIdMH = mh.id;

    // 3. Resolve Agency
    const [agency] = await db.select({ id: implementingAgencies.id }).from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 4. Resolve Roles
    const [saRole] = await db.select().from(roles).where(eq(roles.name, 'SUPER_ADMIN')).limit(1);
    const [poRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [maRole] = await db.select().from(roles).where(eq(roles.name, 'MINISTRY_ADMIN')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    const makeUser = async (nameSuffix: string, emailPrefix: string) => {
      const [u] = await db.insert(users).values({
        name: `${nameSuffix} ${ts}`,
        email: `${emailPrefix}.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      }).returning({ id: users.id });
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

    // Super Admin Session
    superAdminCookie = await makeSession(superAdminId);

    // Project Officer in KA
    projOfficerId = await makeUser('KA Project Officer', 'po.parcels');
    await assignRole(projOfficerId, poRole.id);
    await assignUnit(projOfficerId, unitIdKA);
    projOfficerCookie = await makeSession(projOfficerId);

    // Ministry Admin in KA
    ministryAdminId = await makeUser('KA Ministry Admin', 'ma.parcels');
    await assignRole(ministryAdminId, maRole.id);
    await assignUnit(ministryAdminId, unitIdKA);
    ministryAdminCookie = await makeSession(ministryAdminId);

    // Land Officer in KA
    landOfficerId = await makeUser('KA Land Officer', 'lo.parcels');
    await assignRole(landOfficerId, loRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // Field Officer in KA
    fieldOfficerId = await makeUser('KA Field Officer', 'fo.parcels');
    await assignRole(fieldOfficerId, foRole.id);
    await assignUnit(fieldOfficerId, unitIdKA);
    fieldOfficerCookie = await makeSession(fieldOfficerId);

    // Field Officer in MH
    mhFieldOfficerId = await makeUser('MH Field Officer', 'mh.fo.parcels');
    await assignRole(mhFieldOfficerId, foRole.id);
    await assignUnit(mhFieldOfficerId, unitIdMH);
    mhFieldOfficerCookie = await makeSession(mhFieldOfficerId);

    // Helper to create a test project
    const createTestProject = async (unitId: string, creatorId: string, pCode: string) => {
      const [proj] = await db.insert(projects).values({
        projectCode: pCode,
        name: `Test Project ${pCode}`,
        projectType: 'HIGHWAY',
        status: 'REGISTERED',
        administrativeUnitId: unitId,
        implementingAgencyId: agencyId,
        createdBy: creatorId,
      }).returning({ id: projects.id });
      createdProjectIds.push(proj.id);
      return proj.id;
    };

    const kaProjectId = await createTestProject(unitIdKA, projOfficerId, `PRJ-KA-${ts}`);
    const mhProjectId = await createTestProject(unitIdMH, superAdminId, `PRJ-MH-${ts}`);

    // Helper to create acquisition cases in various statuses
    const createCase = async (projId: string, status: 'DRAFT' | 'SUBMITTED' | 'AWAITING_FIELD_VERIFICATION', refSuffix: string) => {
      const [acq] = await db.insert(acquisitionCases).values({
        caseReference: `NLAMS-CASE-${ts}-${refSuffix}`,
        projectId: projId,
        title: `Acquisition Case ${refSuffix}`,
        status,
        createdBy: landOfficerId,
        updatedBy: landOfficerId,
      }).returning({ id: acquisitionCases.id });
      createdCaseIds.push(acq.id);
      return acq.id;
    };

    draftCaseId = await createCase(kaProjectId, 'DRAFT', 'DFT');
    submittedCaseId = await createCase(kaProjectId, 'SUBMITTED', 'SUB');
    awaitingVerifCaseId = await createCase(kaProjectId, 'AWAITING_FIELD_VERIFICATION', 'AVF');
    mhAwaitingVerifCaseId = await createCase(mhProjectId, 'AWAITING_FIELD_VERIFICATION', 'MH-AVF');
  });

  after(async () => {
    // Cleanup in reverse dependency order
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

  // Helper to make request
  const makeReq = (method: string, url: string, cookie?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it('1. Unauthenticated requests are rejected with 401', async () => {
    const getReq = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`);
    const getRes = await parcelsGetHandler(getReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(getRes.status, 401);

    const postReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, undefined, {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: '101',
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    });
    const postRes = await parcelsPostHandler(postReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(postRes.status, 401);

    const patchReq = makeReq('PATCH', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/some-id`, undefined, {
      proposedAffectedArea: 1200,
    });
    const patchRes = await parcelDetailPatchHandler(patchReq, { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId: '00000000-0000-0000-0000-000000000000' }) });
    assert.equal(patchRes.status, 401);
  });

  it('2. Non-FIELD_OFFICER roles cannot add parcels (403 Forbidden)', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: '101',
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    };

    // Land Officer attempt
    const loReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, landOfficerCookie, payload);
    const loRes = await parcelsPostHandler(loReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(loRes.status, 403, 'Land Officer must be forbidden from adding parcels during field verification');

    // Project Officer attempt
    const poReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, projOfficerCookie, payload);
    const poRes = await parcelsPostHandler(poReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(poRes.status, 403, 'Project Officer must be forbidden from adding parcels');

    // Super Admin attempt (separation of duties strictly enforced)
    const saReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, superAdminCookie, payload);
    const saRes = await parcelsPostHandler(saReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(saRes.status, 403, 'Super Admin without FIELD_OFFICER role must be forbidden from adding parcels');
  });

  it('3. Cross-scope field officer is rejected (403 or 404)', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: '102',
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    };

    // MH field officer attempting to add parcel to KA case
    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, mhFieldOfficerCookie, payload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 403, 'Cross-scope field officer must be forbidden');
  });

  it('4. Attempts to add parcels before field-verification authorization are rejected (400 Bad Request)', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: '103',
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    };

    // DRAFT case
    const draftReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${draftCaseId}/parcels`, fieldOfficerCookie, payload);
    const draftRes = await parcelsPostHandler(draftReq, { params: Promise.resolve({ id: draftCaseId }) });
    assert.equal(draftRes.status, 400, 'Cannot add parcels when case is in DRAFT');
    const draftJson = await draftRes.json();
    assert.match(draftJson.error, /AWAITING_FIELD_VERIFICATION/i);

    // SUBMITTED case
    const subReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${submittedCaseId}/parcels`, fieldOfficerCookie, payload);
    const subRes = await parcelsPostHandler(subReq, { params: Promise.resolve({ id: submittedCaseId }) });
    assert.equal(subRes.status, 400, 'Cannot add parcels when case is in SUBMITTED');
  });

  it('5. Field Officer successfully creates and associates new canonical parcel', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-${ts}-1`,
      subdivisionNumber: '1A',
      landRecordReference: `RTC-KA-${ts}-1`,
      totalArea: 4000.5,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1200.25,
      affectedAreaUnit: 'SQ_M',
      landUse: 'Agricultural',
      physicalDescription: 'Fertile red soil with irrigation channel',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, payload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 201);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id, 'caseParcelId must be returned');
    assert.ok(json.data.parcel.id, 'canonical parcel ID must be returned');
    assert.equal(json.data.parcel.surveyNumber, `SY-${ts}-1`);
    assert.equal(Number(json.data.parcel.totalArea), 4000.5);
    assert.equal(Number(json.data.proposedAffectedArea), 1200.25);
    assert.equal(json.data.affectedAreaUnit, 'SQ_M');
    assert.ok(json.data.parcel.parcelId.startsWith('NLAMS-PRC-'), 'parcelId must be generated via sequence');

    createdCaseParcelIds.push(json.data.id);
    createdParcelIds.push(json.data.parcel.id);
  });

  it('6. Lists parcels associated with the case via GET', async () => {
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie);
    const res = await parcelsGetHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 1, 'Should return at least 1 associated parcel');
    assert.ok(json.pagination);
    assert.equal(json.pagination.page, 1);
  });

  it('7. Updates permitted case-specific parcel details via PATCH', async () => {
    const caseParcelId = createdCaseParcelIds[0];

    const patchPayload = {
      proposedAffectedArea: 2500,
      affectedAreaUnit: 'SQ_M',
    };

    const req = makeReq('PATCH', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}`, fieldOfficerCookie, patchPayload);
    const res = await parcelDetailPatchHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(Number(json.data.proposedAffectedArea), 2500);

    // Verify canonical parcel totalArea was preserved and not overwritten!
    assert.equal(Number(json.data.parcel.totalArea), 4000.5, 'Canonical totalArea must remain intact');
  });

  it('8. Proposed affected area cannot exceed total recorded parcel area (comparable units)', async () => {
    // A) In creation payload: 6000 SQ_M proposed for 4000 SQ_M parcel
    const invalidCreatePayload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-${ts}-EXCEED`,
      totalArea: 4000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 6000, // Exceeds 4000
      affectedAreaUnit: 'SQ_M',
    };

    const createReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, invalidCreatePayload);
    const createRes = await parcelsPostHandler(createReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(createRes.status, 400, 'Creation with proposedArea > totalArea must be rejected');

    // B) With unit conversion: totalArea = 1 HECTARE (10,000 SQ_M), proposedAffectedArea = 15,000 SQ_M
    const invalidUnitsPayload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-${ts}-UNIT-EXCEED`,
      totalArea: 1,
      areaUnit: 'HECTARE',
      proposedAffectedArea: 15000, // 1.5 hectares > 1 hectare
      affectedAreaUnit: 'SQ_M',
    };

    const unitReq = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, invalidUnitsPayload);
    const unitRes = await parcelsPostHandler(unitReq, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(unitRes.status, 400, 'Exceeding area via different units must be rejected');

    // C) In PATCH: trying to update proposedAffectedArea beyond recorded area
    const caseParcelId = createdCaseParcelIds[0];
    const invalidPatchReq = makeReq('PATCH', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}`, fieldOfficerCookie, {
      proposedAffectedArea: 99999, // Exceeds 4000.5
    });
    const patchRes = await parcelDetailPatchHandler(invalidPatchReq, { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }) });
    assert.equal(patchRes.status, 400, 'Patch exceeding total area must be rejected');
  });

  it('9. Duplicate parcel association with the same case is rejected (409 Conflict)', async () => {
    // Attempting to re-add the exact same locality & survey parcel to the same case
    const dupPayload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-${ts}-1`,
      subdivisionNumber: '1A',
      totalArea: 4000.5,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 500,
      affectedAreaUnit: 'SQ_M',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, dupPayload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 409, 'Duplicate parcel association must return 409 Conflict');
    const json = await res.json();
    assert.match(json.error, /already associated/i);
  });

  it('10. Same survey number in different villages creates distinct canonical parcels', async () => {
    // Survey number "SY-DIFF" in Yelahanka
    const p1Req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-DIFF-${ts}`,
      totalArea: 3000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    });
    const p1Res = await parcelsPostHandler(p1Req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(p1Res.status, 201);
    const p1Json = await p1Res.json();
    createdCaseParcelIds.push(p1Json.data.id);
    createdParcelIds.push(p1Json.data.parcel.id);

    // Same survey number "SY-DIFF" in Hebbal (different village)
    const p2Req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Hebbal',
      surveyNumber: `SY-DIFF-${ts}`,
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 2000,
      affectedAreaUnit: 'SQ_M',
    });
    const p2Res = await parcelsPostHandler(p2Req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(p2Res.status, 201, 'Same survey number in different locality must succeed');
    const p2Json = await p2Res.json();
    createdCaseParcelIds.push(p2Json.data.id);
    createdParcelIds.push(p2Json.data.parcel.id);

    assert.notEqual(p1Json.data.parcel.id, p2Json.data.parcel.id, 'Parcels must be distinct canonical rows');
  });

  it('11. Associates an existing parcel by parcelId/UUID', async () => {
    const existingParcelId = createdParcelIds[0];

    // Create another case in AWAITING_FIELD_VERIFICATION in KA
    const [case2] = await db.insert(acquisitionCases).values({
      caseReference: `NLAMS-CASE-${ts}-C2`,
      projectId: createdProjectIds[0],
      title: `Second Case ${ts}`,
      status: 'AWAITING_FIELD_VERIFICATION',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    createdCaseIds.push(case2.id);

    const payload = {
      parcelId: existingParcelId,
      proposedAffectedArea: 800,
      affectedAreaUnit: 'SQ_M',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${case2.id}/parcels`, fieldOfficerCookie, payload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: case2.id }) });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.parcel.id, existingParcelId, 'Must link to existing canonical parcel');
    createdCaseParcelIds.push(json.data.id);
  });

  it('12. Rejects client-supplied IDs, roles, or audit fields (400 Bad Request)', async () => {
    const spoofPayload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Yelahanka',
      surveyNumber: `SY-SPOOF-${ts}`,
      totalArea: 3000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
      createdBy: superAdminId, // Malicious spoof
      id: '00000000-0000-0000-0000-000000000000',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, spoofPayload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 400, 'Client-supplied createdBy/id must be rejected');
  });
});
