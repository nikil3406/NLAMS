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
import { convertAreaToSqm } from '../../src/lib/geo-utils';

// Route Handlers
import { GET as parcelsGetHandler, POST as parcelsPostHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/route';
import { GET as parcelDetailGetHandler, PATCH as parcelDetailPatchHandler } from '../../src/app/api/acquisition-cases/[id]/parcels/[caseParcelId]/route';

describe('NLAMS — Step 3: Parcel Detail Entry UI & Workflow Integration', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdParcelIds: string[] = [];
  const createdCaseParcelIds: string[] = [];

  let superAdminId: string;
  let fieldOfficerId: string;
  let fieldOfficerCookie: string;
  let landOfficerId: string;
  let landOfficerCookie: string;

  let unitIdKA: string;
  let agencyId: string;
  let projectId: string;
  let awaitingVerifCaseId: string;
  let draftCaseId: string;

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super Admin not found.');
    superAdminId = sa.id;

    // 2. Resolve Administrative Unit (KA) & Agency
    const [ka] = await db.select({ id: administrativeUnits.id }).from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    unitIdKA = ka.id;

    const [agency] = await db.select({ id: implementingAgencies.id }).from(implementingAgencies).limit(1);
    agencyId = agency.id;

    // 3. Resolve Roles
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);

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

    fieldOfficerId = await makeUser('KA Field Officer UI', 'fo.ui');
    await assignRole(fieldOfficerId, foRole.id);
    await assignUnit(fieldOfficerId, unitIdKA);
    fieldOfficerCookie = await makeSession(fieldOfficerId);

    landOfficerId = await makeUser('KA Land Officer UI', 'lo.ui');
    await assignRole(landOfficerId, loRole.id);
    await assignUnit(landOfficerId, unitIdKA);
    landOfficerCookie = await makeSession(landOfficerId);

    // Create Project
    const [proj] = await db.insert(projects).values({
      projectCode: `PRJ-UI-${ts}`,
      name: `UI Workflow Project ${ts}`,
      projectType: 'RAILWAY',
      status: 'REGISTERED',
      administrativeUnitId: unitIdKA,
      implementingAgencyId: agencyId,
      createdBy: superAdminId,
    }).returning({ id: projects.id });
    projectId = proj.id;
    createdProjectIds.push(projectId);

    // Create Cases
    const [c1] = await db.insert(acquisitionCases).values({
      caseReference: `NLAMS-CASE-UI-${ts}-AVF`,
      projectId,
      title: `Field Verification Case ${ts}`,
      status: 'AWAITING_FIELD_VERIFICATION',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    awaitingVerifCaseId = c1.id;
    createdCaseIds.push(awaitingVerifCaseId);

    const [c2] = await db.insert(acquisitionCases).values({
      caseReference: `NLAMS-CASE-UI-${ts}-DFT`,
      projectId,
      title: `Draft Case ${ts}`,
      status: 'DRAFT',
      createdBy: landOfficerId,
      updatedBy: landOfficerId,
    }).returning({ id: acquisitionCases.id });
    draftCaseId = c2.id;
    createdCaseIds.push(draftCaseId);
  });

  after(async () => {
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

  const makeReq = (method: string, url: string, cookie?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers['cookie'] = cookie;
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it('1. Initial state: Case has 0 parcels and returns empty list with pagination metadata', async () => {
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie);
    const res = await parcelsGetHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 0);
    assert.equal(json.pagination.total, 0);
  });

  it('2. Field Officer creates parcel with complete 4-section data', async () => {
    const completePayload = {
      // Section A: Land identification
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Devanahalli',
      surveyNumber: `SY-UI-${ts}-1`,
      subdivisionNumber: '2/B',
      landRecordReference: `RTC-DEV-${ts}`,
      // Section B: Area details
      totalArea: 10000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 3500.75,
      affectedAreaUnit: 'SQ_M',
      // Section C: Physical land details
      landUse: 'Agricultural (Wet / Irrigated)',
      physicalDescription: 'Structures: Borewell and pump house | Trees/Crops: Sugarcane | Access & Boundary: North road access | Notes: Flat alluvial soil',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie, completePayload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 201);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id);
    assert.equal(json.data.parcel.surveyNumber, `SY-UI-${ts}-1`);
    assert.equal(json.data.parcel.subdivisionNumber, '2/B');
    assert.equal(json.data.parcel.village, 'Devanahalli');
    assert.equal(Number(json.data.parcel.totalArea), 10000);
    assert.equal(Number(json.data.proposedAffectedArea), 3500.75);
    assert.ok(json.data.parcel.physicalDescription.includes('Borewell and pump house'));

    createdCaseParcelIds.push(json.data.id);
    createdParcelIds.push(json.data.parcel.id);
  });

  it('3. Parcel list updates dynamically after creation', async () => {
    const req = makeReq('GET', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, fieldOfficerCookie);
    const res = await parcelsGetHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.data.length, 1);
    assert.equal(json.pagination.total, 1);
    assert.equal(json.data[0].parcel.surveyNumber, `SY-UI-${ts}-1`);
  });

  it('4. Field Officer updates proposed affected area via PATCH', async () => {
    const caseParcelId = createdCaseParcelIds[0];
    const patchReq = makeReq('PATCH', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels/${caseParcelId}`, fieldOfficerCookie, {
      proposedAffectedArea: 4200,
      affectedAreaUnit: 'SQ_M',
    });
    const patchRes = await parcelDetailPatchHandler(patchReq, { params: Promise.resolve({ id: awaitingVerifCaseId, caseParcelId }) });
    assert.equal(patchRes.status, 200);

    const json = await patchRes.json();
    assert.equal(Number(json.data.proposedAffectedArea), 4200);
    assert.equal(Number(json.data.parcel.totalArea), 10000, 'Recorded parcel area remains untouched');
  });

  it('5. Area calculation utility validates cross-unit thresholds accurately', () => {
    // 1 Hectare = 10,000 SQ_M
    const hectareSqm = convertAreaToSqm(1, 'HECTARE');
    assert.equal(hectareSqm, 10000);

    // 1 Acre = 4046.8564224 SQ_M
    const acreSqm = convertAreaToSqm(1, 'ACRE');
    assert.ok(Math.abs(acreSqm - 4046.856) < 0.01);

    // 2.5 Hectares = 25,000 SQ_M
    assert.equal(convertAreaToSqm(2.5, 'HECTARE'), 25000);
  });

  it('6. Non-field officers cannot add parcels even if case is Awaiting Field Verification', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Devanahalli',
      surveyNumber: `SY-LO-${ts}`,
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${awaitingVerifCaseId}/parcels`, landOfficerCookie, payload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: awaitingVerifCaseId }) });
    assert.equal(res.status, 403);
  });

  it('7. Field Officer cannot add parcels to a Draft case', async () => {
    const payload = {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      taluk: 'Bengaluru North',
      village: 'Devanahalli',
      surveyNumber: `SY-DFT-${ts}`,
      totalArea: 5000,
      areaUnit: 'SQ_M',
      proposedAffectedArea: 1000,
      affectedAreaUnit: 'SQ_M',
    };

    const req = makeReq('POST', `http://localhost:3000/api/acquisition-cases/${draftCaseId}/parcels`, fieldOfficerCookie, payload);
    const res = await parcelsPostHandler(req, { params: Promise.resolve({ id: draftCaseId }) });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /AWAITING_FIELD_VERIFICATION/i);
  });
});
