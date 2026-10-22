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
import {
  GET as boundaryGetHandler,
  POST as boundaryPostHandler,
} from '../../src/app/api/projects/[id]/boundary/route';
import { POST as calculateAreaHandler } from '../../src/app/api/projects/calculate-area/route';
import { projectBoundaryService } from '../../src/services/projects/project-boundary.service';

describe('Project Spatial Boundary Integration & Persistence', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let karnatakaOfficerId: string;
  let karnatakaOfficerCookie: string;

  let maharashtraOfficerId: string;
  let maharashtraOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

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

  // Valid revised polygon
  const revisedPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [77.58, 12.97],
        [77.61, 12.97],
        [77.61, 13.0],
        [77.58, 13.0],
        [77.58, 12.97],
      ],
    ],
  };

  // Valid MultiPolygon
  const validMultiPolygon = {
    type: 'MultiPolygon' as const,
    coordinates: [
      [
        [
          [77.58, 12.97],
          [77.59, 12.97],
          [77.59, 12.98],
          [77.58, 12.98],
          [77.58, 12.97],
        ],
      ],
      [
        [
          [77.6, 12.97],
          [77.61, 12.97],
          [77.61, 12.98],
          [77.6, 12.98],
          [77.6, 12.97],
        ],
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

    // 5. Create Karnataka Project Officer (has PROJECT_CREATE, PROJECT_VIEW, PROJECT_UPDATE)
    const [kaUser] = await db
      .insert(users)
      .values({
        name: `KA Boundary Officer ${ts}`,
        email: `ka.boundary.${ts}@nlams.test`,
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
        name: `MH Boundary Officer ${ts}`,
        email: `mh.boundary.${ts}@nlams.test`,
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

    // 7. Create Field Officer (NO PROJECT_CREATE permission)
    const [foUser] = await db
      .insert(users)
      .values({
        name: `Field Officer Boundary ${ts}`,
        email: `fo.boundary.${ts}@nlams.test`,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    fieldOfficerId = foUser.id;
    createdUserIds.push(fieldOfficerId);

    await db.insert(userRoles).values({
      userId: fieldOfficerId,
      roleId: fieldOffRole.id,
      assignedBy: superAdminId,
    });
    await db.insert(userAssignments).values({
      userId: fieldOfficerId,
      administrativeUnitId: unitIdKA,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    const { token: foToken } = await sessionService.createSession(fieldOfficerId);
    fieldOfficerCookie = `${authConfig.cookieName}=${foToken}`;
  });

  after(async () => {
    // Cleanup created data
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

  it('1. Geometry validation rejects malformed, unclosed, or invalid coordinates', async () => {
    // A. Unclosed ring
    const unclosedGeom = {
      type: 'Polygon',
      coordinates: [
        [
          [77.58, 12.97],
          [77.6, 12.97],
          [77.6, 12.99],
          [77.58, 12.99],
        ],
      ],
    };

    const reqUnclosed = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: unclosedGeom }),
    });
    const resUnclosed = await calculateAreaHandler(reqUnclosed);
    assert.equal(resUnclosed.status, 400);
    const jsonUnclosed = await resUnclosed.json();
    assert.equal(jsonUnclosed.success, false);

    // B. Coordinates out of bounds (latitude 120 > 90)
    const outOfBoundsGeom = {
      type: 'Polygon',
      coordinates: [
        [
          [77.58, 120.0],
          [77.6, 120.0],
          [77.6, 120.5],
          [77.58, 120.5],
          [77.58, 120.0],
        ],
      ],
    };
    const reqOOB = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: outOfBoundsGeom }),
    });
    const resOOB = await calculateAreaHandler(reqOOB);
    assert.equal(resOOB.status, 400);

    // C. Non-polygonal geometry (Point)
    const pointGeom = {
      type: 'Point',
      coordinates: [77.58, 12.97],
    };
    const reqPoint = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: pointGeom }),
    });
    const resPoint = await calculateAreaHandler(reqPoint);
    assert.equal(resPoint.status, 400);
  });

  it('2. PostGIS rejects self-intersecting (bowtie) polygon geometry', async () => {
    // Bowtie polygon with self-intersection
    const selfIntersectingGeom = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [77.58, 12.97],
          [77.6, 12.99],
          [77.58, 12.99],
          [77.6, 12.97],
          [77.58, 12.97],
        ],
      ],
    };

    const req = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: selfIntersectingGeom }),
    });

    const res = await calculateAreaHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.error, /self-intersection|Invalid geometry/i);
  });

  it('3. Server-side PostGIS area measurement computes ellipsoidal area accurately', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: validBengaluruPolygon }),
    });

    const res = await calculateAreaHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.areaSqm > 4000000); // ~4.7 sq km in Bengaluru
    assert.ok(json.data.areaHectares > 400);
    assert.ok(json.data.areaAcres > 1000);
    assert.equal(json.data.geometryType, 'ST_Polygon');
    assert.equal(json.data.isValid, true);
  });

  it('4. MultiPolygon geometry is supported and measured accurately', async () => {
    const req = new NextRequest('http://localhost:3000/api/projects/calculate-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify({ geometry: validMultiPolygon }),
    });

    const res = await calculateAreaHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.areaSqm > 0);
    assert.equal(json.data.geometryType, 'ST_MultiPolygon');
  });

  let createdProjectId: string;

  it('5. Project creation persists initial boundary version (version 1) transactionally', async () => {
    const createPayload = {
      name: `Highway Corridor with Boundary ${ts}`,
      description: 'Corridor right-of-way planning project',
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: true,
      estimatedCost: '50000000.00',
      boundary: {
        geometry: validBengaluruPolygon,
        estimatedLandArea: '150.50',
        estimatedAreaUnit: 'HECTARE',
        changeReason: 'Initial project boundary for DPR',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(createPayload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id);
    assert.equal(json.data.status, 'DRAFT');

    createdProjectId = json.data.id;
    createdProjectIds.push(createdProjectId);

    // Verify boundary was persisted in DB
    const [boundary] = await db
      .select()
      .from(projectBoundaryVersions)
      .where(eq(projectBoundaryVersions.projectId, createdProjectId));

    assert.ok(boundary);
    assert.equal(boundary.versionNumber, 1);
    assert.equal(boundary.estimatedAreaUnit, 'HECTARE');
    assert.equal(boundary.estimatedLandArea, '150.50');
    assert.ok(Number(boundary.calculatedGeometryArea) > 0);
    assert.equal(boundary.createdBy, karnatakaOfficerId);
    assert.equal(boundary.changeReason, 'Initial project boundary for DPR');
  });

  it('6. Transactional consistency: Invalid boundary rolls back project creation', async () => {
    const invalidPayload = {
      name: `Should Rollback Project ${ts}`,
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: true,
      boundary: {
        // Self-intersecting polygon
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [77.58, 12.97],
              [77.6, 12.99],
              [77.58, 12.99],
              [77.6, 12.97],
              [77.58, 12.97],
            ],
          ],
        },
        estimatedLandArea: '100.00',
        estimatedAreaUnit: 'HECTARE',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(invalidPayload),
    });

    const res = await projectsPostHandler(req);
    assert.equal(res.status, 400);

    // Verify project record was NOT created in DB (clean rollback)
    const [orphaned] = await db
      .select()
      .from(projects)
      .where(eq(projects.name, invalidPayload.name));
    assert.equal(orphaned, undefined);
  });

  it('7. Retrieval of saved boundary via GET /api/projects/[id]/boundary and project details', async () => {
    // A. Via boundary endpoint
    const reqBoundary = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary`, {
      method: 'GET',
      headers: { cookie: karnatakaOfficerCookie },
    });
    const resBoundary = await boundaryGetHandler(reqBoundary, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(resBoundary.status, 200);
    const jsonBoundary = await resBoundary.json();
    assert.equal(jsonBoundary.success, true);
    assert.equal(jsonBoundary.data.versionNumber, 1);
    assert.equal(jsonBoundary.data.geometry.type, 'Polygon');
    assert.equal(jsonBoundary.data.estimatedAreaUnit, 'HECTARE');
    assert.equal(jsonBoundary.data.estimatedLandArea, '150.50');
    assert.ok(Number(jsonBoundary.data.calculatedGeometryArea) > 0);

    // B. Via project detail endpoint
    const reqProject = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}`, {
      method: 'GET',
      headers: { cookie: karnatakaOfficerCookie },
    });
    const resProject = await projectDetailGetHandler(reqProject, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(resProject.status, 200);
    const jsonProject = await resProject.json();
    assert.equal(jsonProject.success, true);
    assert.ok(jsonProject.data.boundary);
    assert.equal(jsonProject.data.boundary.versionNumber, 1);
  });

  it('8. Boundary revision creates new version (version 2) without overwriting history', async () => {
    const revisionPayload = {
      geometry: revisedPolygon,
      estimatedLandArea: '185.00',
      estimatedAreaUnit: 'HECTARE',
      changeReason: 'Alignment adjusted to bypass water body during DPR review',
    };

    const reqPost = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: karnatakaOfficerCookie,
      },
      body: JSON.stringify(revisionPayload),
    });

    const resPost = await boundaryPostHandler(reqPost, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(resPost.status, 201);
    const jsonPost = await resPost.json();
    assert.equal(jsonPost.success, true);
    assert.equal(jsonPost.data.versionNumber, 2);
    assert.equal(jsonPost.data.estimatedLandArea, '185.00');
    assert.equal(jsonPost.data.changeReason, revisionPayload.changeReason);

    // Verify version history retains both versions
    const reqHistory = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary?history=true`, {
      method: 'GET',
      headers: { cookie: karnatakaOfficerCookie },
    });
    const resHistory = await boundaryGetHandler(reqHistory, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(resHistory.status, 200);
    const jsonHistory = await resHistory.json();
    assert.equal(jsonHistory.success, true);
    assert.equal(jsonHistory.data.length, 2);
    assert.equal(jsonHistory.data[0].versionNumber, 2); // Descending order
    assert.equal(jsonHistory.data[1].versionNumber, 1);
  });

  it('9. Cross-scope boundary access returns 404 (does not leak project existence)', async () => {
    // Maharashtra officer tries to access Karnataka project boundary
    const req = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary`, {
      method: 'GET',
      headers: { cookie: maharashtraOfficerCookie },
    });
    const res = await boundaryGetHandler(req, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(res.status, 404);
  });

  it('10. Unauthorized user without PROJECT_UPDATE cannot append boundary version', async () => {
    // Field officer (lacks PROJECT_UPDATE)
    const req = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: fieldOfficerCookie,
      },
      body: JSON.stringify({
        geometry: revisedPolygon,
        estimatedLandArea: '190.00',
        estimatedAreaUnit: 'HECTARE',
      }),
    });
    const res = await boundaryPostHandler(req, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(res.status, 403);
  });

  it('11. Unauthenticated requests are rejected with 401', async () => {
    const req = new NextRequest(`http://localhost:3000/api/projects/${createdProjectId}/boundary`, {
      method: 'GET',
    });
    const res = await boundaryGetHandler(req, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    assert.equal(res.status, 401);
  });
});
