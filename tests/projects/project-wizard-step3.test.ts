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

import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { userRoles } from '../../db/schema/user-roles';
import { userAssignments } from '../../db/schema/user-assignments';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { projects } from '../../db/schema/projects';
import { projectBoundaryVersions } from '../../db/schema/project-boundary-versions';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as projectsPostHandler } from '../../src/app/api/projects/route';
import { GET as projectDetailGetHandler } from '../../src/app/api/projects/[id]/route';

describe('Step 3: Wizard Review, Confirmation & Final Project Creation Flow', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let karnatakaOfficerId: string;
  let karnatakaOfficerCookie: string;

  let maharashtraOfficerId: string;
  let maharashtraOfficerCookie: string;

  let viewerOnlyOfficerId: string;
  let viewerOnlyOfficerCookie: string;

  let unitIdKA: string;
  let unitIdMH: string;
  let nhaiAgencyId: string;

  // Valid closed Polygon in Bengaluru, Karnataka
  const validBengaluruPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [77.58, 12.97],
        [77.6, 12.97],
        [77.6, 12.99],
        [77.58, 12.99],
        [77.58, 12.97],
      ],
    ],
  };

  before(async () => {
    // 1. Resolve Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);

    if (!sa) throw new Error('Super admin not found for test setup');
    superAdminId = sa.id;
    const { token: saToken } = await sessionService.createSession(superAdminId);
    superAdminCookie = `${authConfig.cookieName}=${saToken}`;

    // 2. Resolve admin units
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitIdKA = ka.id;
    unitIdMH = mh.id;

    // 3. Resolve roles
    const [projOffRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [fieldOffRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    // 4. Resolve active agency (NHAI)
    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    nhaiAgencyId = nhai.id;

    const pwdHash = await passwordService.hashPassword('Pass@123456789');

    // 5. Create Karnataka Project Officer (has PROJECT_CREATE)
    const [kaUser] = await db
      .insert(users)
      .values({
        name: `KA Wizard Officer ${ts}`,
        email: `ka.wizard.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    karnatakaOfficerId = kaUser.id;
    createdUserIds.push(karnatakaOfficerId);

    await db.insert(userRoles).values({
      userId: karnatakaOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: karnatakaOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: kaToken } = await sessionService.createSession(karnatakaOfficerId);
    karnatakaOfficerCookie = `${authConfig.cookieName}=${kaToken}`;

    // 6. Create Maharashtra Project Officer
    const [mhUser] = await db
      .insert(users)
      .values({
        name: `MH Wizard Officer ${ts}`,
        email: `mh.wizard.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    maharashtraOfficerId = mhUser.id;
    createdUserIds.push(maharashtraOfficerId);

    await db.insert(userRoles).values({
      userId: maharashtraOfficerId,
      roleId: projOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: maharashtraOfficerId,
      administrativeUnitId: unitIdMH,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: mhToken } = await sessionService.createSession(maharashtraOfficerId);
    maharashtraOfficerCookie = `${authConfig.cookieName}=${mhToken}`;

    // 7. Create Field Officer (without PROJECT_CREATE)
    const [foUser] = await db
      .insert(users)
      .values({
        name: `Field Officer NoCreate ${ts}`,
        email: `fo.nocreate.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    viewerOnlyOfficerId = foUser.id;
    createdUserIds.push(viewerOnlyOfficerId);

    await db.insert(userRoles).values({
      userId: viewerOnlyOfficerId,
      roleId: fieldOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: viewerOnlyOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: foToken } = await sessionService.createSession(viewerOnlyOfficerId);
    viewerOnlyOfficerCookie = `${authConfig.cookieName}=${foToken}`;
  });

  after(async () => {
    if (createdProjectIds.length > 0) {
      await db.delete(projectBoundaryVersions).where(inArray(projectBoundaryVersions.projectId, createdProjectIds));
      await db.delete(projects).where(inArray(projects.id, createdProjectIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
      await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await client.end();
  });

  it('1. Step 3 Final Submission with Complete Project and Boundary Details succeeds in DRAFT status', async () => {
    const wizardPayload = {
      name: `Bengaluru Peripheral Ring Road Phase ${ts}`,
      description: 'Major arterial corridor linking Hosur Road to Tumakuru Road.',
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: true,
      estimatedCost: '450000000.00',
      plannedStartDate: '2026-05-01',
      plannedEndDate: '2029-12-31',
      boundary: {
        geometry: validBengaluruPolygon,
        estimatedLandArea: '145.50',
        estimatedAreaUnit: 'HECTARE',
        changeReason: 'Initial project boundary',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(wizardPayload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201, 'Must return 201 Created on successful confirmation');

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id, 'Must return generated project ID for client redirect');
    assert.equal(json.data.status, 'DRAFT', 'Initial status must strictly be DRAFT');
    assert.equal(json.data.name, wizardPayload.name);
    assert.equal(json.data.landAcquisitionRequired, true);

    createdProjectIds.push(json.data.id);

    // Verify detail endpoint returns complete persisted data and boundary version 1
    const detailReq = new NextRequest(`http://localhost:3000/api/projects/${json.data.id}`, {
      headers: { cookie: karnatakaOfficerCookie },
    });
    const detailRes = await projectDetailGetHandler(detailReq, {
      params: Promise.resolve({ id: json.data.id }),
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.ok(detailJson.data.boundary, 'Boundary version 1 must be attached');
    assert.equal(detailJson.data.boundary.versionNumber, 1);
    assert.equal(detailJson.data.boundary.estimatedLandArea, '145.50');
    assert.equal(detailJson.data.boundary.estimatedAreaUnit, 'HECTARE');
    assert.ok(Number(detailJson.data.boundary.calculatedGeometryArea) > 0, 'PostGIS calculated geometry area must be > 0');
  });

  it('2. Step 3 Final Submission when optional location data is absent (landAcquisitionRequired = false)', async () => {
    const wizardPayloadNoBoundary = {
      name: `State IT Corridor Modernization ${ts}`,
      description: 'Upgradation within existing institutional campus premises.',
      projectType: 'Public Infrastructure',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: false,
      estimatedCost: '75000000.00',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2027-06-01',
      // boundary omitted as location data is optional
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(wizardPayloadNoBoundary),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201, 'Must return 201 Created');

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id);
    assert.equal(json.data.status, 'DRAFT');
    assert.equal(json.data.landAcquisitionRequired, false);

    createdProjectIds.push(json.data.id);

    // Verify project detail does not have boundary record
    const detailReq = new NextRequest(`http://localhost:3000/api/projects/${json.data.id}`, {
      headers: { cookie: karnatakaOfficerCookie },
    });
    const detailRes = await projectDetailGetHandler(detailReq, {
      params: Promise.resolve({ id: json.data.id }),
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.boundary, null, 'Optional boundary should be null when omitted');
  });

  it('3. Rejects submission with client-manipulated initial status or client-supplied IDs', async () => {
    const tamperedPayload = {
      name: `Tampered Status Project ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: false,
      status: 'REGISTERED', // Illegal client-supplied status
      id: '00000000-0000-0000-0000-000000000001',
      projectCode: 'CUSTOM-OVERRIDE',
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(tamperedPayload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 400, 'Must reject client attempts to set status or ID directly');
    const json = await res.json();
    assert.equal(json.success, false);
  });

  it('4. Rejects submission when user lacks PROJECT_CREATE permission (403 Forbidden)', async () => {
    const payload = {
      name: `Unauthorized Project Creation ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: false,
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: viewerOnlyOfficerCookie, // User lacks PROJECT_CREATE
      },
      body: JSON.stringify(payload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403, 'Must return 403 Forbidden for unauthorized user');
  });

  it('5. Rejects submission across administrative unit boundaries outside user scope (403 Forbidden)', async () => {
    const payload = {
      name: `Cross Scope Project Creation ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdMH, // Outside KA officer scope
      landAcquisitionRequired: false,
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie, // KA assigned officer
      },
      body: JSON.stringify(payload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 403, 'Must return 403 Forbidden when creating outside assigned admin hierarchy');
  });

  it('6. Rejects submission with invalid date order (plannedEndDate < plannedStartDate)', async () => {
    const invalidDatePayload = {
      name: `Invalid Date Project ${ts}`,
      projectType: 'Railway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: false,
      plannedStartDate: '2028-01-01',
      plannedEndDate: '2026-01-01', // Earlier!
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(invalidDatePayload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.ok(json.error.includes('Planned end date cannot be earlier than planned start date'));
  });
});
