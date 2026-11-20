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
import { GET as projectDetailGetHandler, PATCH as projectPatchHandler } from '../../src/app/api/projects/[id]/route';

describe('Unified Project Editing Interface & Boundary Persistence', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  let creatorUserId: string;
  let creatorCookie: string;
  let otherUserId: string;
  let otherUserCookie: string;

  let unitIdKA: string;
  let nhaiAgencyId: string;

  // Initial Polygon (v1)
  const initialPolygon = {
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

  // Modified Polygon (v2)
  const modifiedPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [77.57, 12.96],
        [77.61, 12.96],
        [77.61, 12.995],
        [77.57, 12.995],
        [77.57, 12.96],
      ],
    ],
  };

  function createRequest(
    method: string,
    url: string,
    cookie?: string,
    body?: Record<string, unknown>
  ): NextRequest {
    const headers = new Headers();
    if (cookie) {
      headers.set('cookie', `${authConfig.cookieName}=${cookie}`);
    }
    if (body) {
      headers.set('content-type', 'application/json');
    }
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  before(async () => {
    // 1. Resolve State Administrative Unit (Karnataka)
    const [kaUnit] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, 'KA'))
      .limit(1);

    if (!kaUnit) {
      const [newKA] = await db
        .insert(administrativeUnits)
        .values({
          name: `Karnataka Test ${ts}`,
          code: `KA`,
          type: 'STATE',
          isActive: true,
        })
        .returning();
      unitIdKA = newKA.id;
    } else {
      unitIdKA = kaUnit.id;
    }

    // 2. Resolve Implementing Agency
    const [existingAgency] = await db
      .select()
      .from(implementingAgencies)
      .limit(1);

    if (!existingAgency) {
      const [newAgency] = await db
        .insert(implementingAgencies)
        .values({
          name: `NHAI Test ${ts}`,
          code: `NHAI-${ts}`,
          normalizedName: `nhai test ${ts}`,
          agencyType: 'STATUTORY_AUTHORITY',
          status: 'ACTIVE',
          sourceUrl: 'https://nhai.gov.in',
          sourceVerifiedAt: new Date(),
        })
        .returning();
      nhaiAgencyId = newAgency.id;
    } else {
      nhaiAgencyId = existingAgency.id;
    }

    // 3. Resolve PROJECT_OFFICER role
    const [pmRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'PROJECT_OFFICER'))
      .limit(1);

    assert.ok(pmRole, 'PROJECT_OFFICER role must exist in DB');

    // 4. Create Project Creator User
    const passwordHash = await passwordService.hashPassword('Secret123!');
    const [creatorUser] = await db
      .insert(users)
      .values({
        email: `creator.${ts}@nlams.test`,
        name: `Project Creator ${ts}`,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning();
    creatorUserId = creatorUser.id;
    createdUserIds.push(creatorUserId);

    await db.insert(userRoles).values({
      userId: creatorUserId,
      roleId: pmRole.id,
      assignedBy: creatorUserId,
    });

    await db.insert(userAssignments).values({
      userId: creatorUserId,
      administrativeUnitId: unitIdKA,
      assignedBy: creatorUserId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });

    const creatorSession = await sessionService.createSession(creatorUserId);
    creatorCookie = creatorSession.token;

    // 5. Create Other User (different user in same administrative scope)
    const [otherUser] = await db
      .insert(users)
      .values({
        email: `other.${ts}@nlams.test`,
        name: `Other Officer ${ts}`,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning();
    otherUserId = otherUser.id;
    createdUserIds.push(otherUserId);

    await db.insert(userRoles).values({
      userId: otherUserId,
      roleId: pmRole.id,
      assignedBy: creatorUserId,
    });

    await db.insert(userAssignments).values({
      userId: otherUserId,
      administrativeUnitId: unitIdKA,
      assignedBy: creatorUserId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });

    const otherSession = await sessionService.createSession(otherUserId);
    otherUserCookie = otherSession.token;
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

  it('1. Creator creates project with initial boundary (version 1)', async () => {
    const payload = {
      name: `Unified Edit Test Highway ${ts}`,
      description: 'Initial project description',
      projectType: 'Highway',
      implementingAgencyId: nhaiAgencyId,
      administrativeUnitId: unitIdKA,
      landAcquisitionRequired: true,
      estimatedCost: '50000000.00',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2028-12-31',
      boundary: {
        geometry: initialPolygon,
        estimatedLandArea: '25.50',
        estimatedAreaUnit: 'HECTARE',
        changeReason: 'Initial alignment',
      },
    };

    const req = createRequest('POST', 'http://localhost:3000/api/projects', creatorCookie, payload);
    const res = await projectsPostHandler(req);
    const json = await res.json();
    if (res.status !== 201) {
      console.log('Error 400 details:', JSON.stringify(json, null, 2));
    }
    assert.strictEqual(res.status, 201);
    assert.strictEqual(json.success, true);
    assert.ok(json.data.id);
    createdProjectIds.push(json.data.id);

    // Verify initial boundary version
    const boundaryVersions = await db
      .select()
      .from(projectBoundaryVersions)
      .where(eq(projectBoundaryVersions.projectId, json.data.id));
    assert.strictEqual(boundaryVersions.length, 1);
    assert.strictEqual(boundaryVersions[0].versionNumber, 1);
    assert.strictEqual(boundaryVersions[0].estimatedLandArea, '25.50');
  });

  it('2. Updating Section A (general details only) does NOT erase or overwrite saved boundary', async () => {
    const projectId = createdProjectIds[0];

    // Payload updates only Section A fields (no boundary field provided)
    const updatePayload = {
      name: `Unified Edit Test Highway (Name Updated) ${ts}`,
      description: 'Updated general project description without touching boundary',
      estimatedCost: '55000000.00',
    };

    const patchReq = createRequest(
      'PATCH',
      `http://localhost:3000/api/projects/${projectId}`,
      creatorCookie,
      updatePayload
    );
    const patchRes = await projectPatchHandler(patchReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(patchRes.status, 200);

    const patchJson = await patchRes.json();
    assert.strictEqual(patchJson.success, true);
    assert.strictEqual(patchJson.data.name, updatePayload.name);
    assert.strictEqual(patchJson.data.estimatedCost, '55000000.00');

    // Verify boundary was NOT erased and still has exactly 1 version
    const boundaryVersions = await db
      .select()
      .from(projectBoundaryVersions)
      .where(eq(projectBoundaryVersions.projectId, projectId));
    assert.strictEqual(boundaryVersions.length, 1, 'Boundary must not be duplicated or erased');
    assert.strictEqual(boundaryVersions[0].versionNumber, 1);
    assert.strictEqual(boundaryVersions[0].estimatedLandArea, '25.50');

    // Verify GET /api/projects/[id] returns updated general details AND the saved boundary
    const getReq = createRequest('GET', `http://localhost:3000/api/projects/${projectId}`, creatorCookie);
    const getRes = await projectDetailGetHandler(getReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.data.name, updatePayload.name);
    assert.ok(getJson.data.boundary, 'Saved boundary must be retrieved when reopening project');
    assert.strictEqual(getJson.data.boundary.versionNumber, 1);
    assert.strictEqual(getJson.data.boundary.estimatedLandArea, '25.50');
  });

  it('3. Updating Section B (boundary) together with Section A persists boundary as version 2', async () => {
    const projectId = createdProjectIds[0];

    const unifiedUpdatePayload = {
      name: `Unified Edit Test Highway (Final Realignment) ${ts}`,
      estimatedCost: '60000000.00',
      boundary: {
        geometry: modifiedPolygon,
        estimatedLandArea: '32.75',
        estimatedAreaUnit: 'HECTARE',
        changeReason: 'Realignment to bypass ecological zone',
      },
    };

    const patchReq = createRequest(
      'PATCH',
      `http://localhost:3000/api/projects/${projectId}`,
      creatorCookie,
      unifiedUpdatePayload
    );
    const patchRes = await projectPatchHandler(patchReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(patchRes.status, 200);

    const patchJson = await patchRes.json();
    assert.strictEqual(patchJson.success, true);
    assert.strictEqual(patchJson.data.name, unifiedUpdatePayload.name);

    // Verify version 2 was created and version 1 is preserved
    const boundaryVersions = await db
      .select()
      .from(projectBoundaryVersions)
      .where(eq(projectBoundaryVersions.projectId, projectId));
    assert.strictEqual(boundaryVersions.length, 2, 'History must be preserved with exactly 2 versions');

    const v2 = boundaryVersions.find((v) => v.versionNumber === 2);
    assert.ok(v2, 'Version 2 must exist');
    assert.strictEqual(v2.estimatedLandArea, '32.75');
    assert.strictEqual(v2.changeReason, 'Realignment to bypass ecological zone');

    // Verify GET returns the latest version (version 2)
    const getReq = createRequest('GET', `http://localhost:3000/api/projects/${projectId}`, creatorCookie);
    const getRes = await projectDetailGetHandler(getReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.data.boundary.versionNumber, 2);
    assert.strictEqual(getJson.data.boundary.estimatedLandArea, '32.75');
  });

  it('4. Non-creator user cannot edit the project (403 Forbidden)', async () => {
    const projectId = createdProjectIds[0];

    const patchReq = createRequest(
      'PATCH',
      `http://localhost:3000/api/projects/${projectId}`,
      otherUserCookie,
      { name: 'Unauthorized Name Edit' }
    );
    const patchRes = await projectPatchHandler(patchReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(patchRes.status, 403);
  });

  it('5. Redrawing boundary to another geometry updates boundary to version 3', async () => {
    const projectId = createdProjectIds[0];

    const redrawnPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [77.56, 12.95],
          [77.62, 12.95],
          [77.62, 12.998],
          [77.56, 12.998],
          [77.56, 12.95],
        ],
      ],
    };

    const patchReq = createRequest(
      'PATCH',
      `http://localhost:3000/api/projects/${projectId}`,
      creatorCookie,
      {
        boundary: {
          geometry: redrawnPolygon,
          estimatedLandArea: '40.00',
          estimatedAreaUnit: 'HECTARE',
          changeReason: 'Redrawn alignment for wider expressway buffer',
        },
      }
    );
    const patchRes = await projectPatchHandler(patchReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(patchRes.status, 200);

    // Verify version 3 exists and total versions = 3
    const versions = await db
      .select()
      .from(projectBoundaryVersions)
      .where(eq(projectBoundaryVersions.projectId, projectId));
    assert.strictEqual(versions.length, 3);
    const v3 = versions.find((v) => v.versionNumber === 3);
    assert.ok(v3);
    assert.strictEqual(v3.estimatedLandArea, '40.00');

    // Verify GET retrieves version 3
    const getReq = createRequest('GET', `http://localhost:3000/api/projects/${projectId}`, creatorCookie);
    const getRes = await projectDetailGetHandler(getReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.data.boundary.versionNumber, 3);
    assert.strictEqual(getJson.data.boundary.estimatedLandArea, '40.00');
  });

  it('6. Invalid/malformed geometry in boundary update is rejected with 400', async () => {
    const projectId = createdProjectIds[0];

    const invalidPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [77.56, 12.95],
          [77.62, 12.95], // not closed
        ],
      ],
    };

    const patchReq = createRequest(
      'PATCH',
      `http://localhost:3000/api/projects/${projectId}`,
      creatorCookie,
      {
        boundary: {
          geometry: invalidPolygon,
          estimatedLandArea: '40.00',
          estimatedAreaUnit: 'HECTARE',
        },
      }
    );
    const patchRes = await projectPatchHandler(patchReq, {
      params: Promise.resolve({ id: projectId }),
    });
    assert.strictEqual(patchRes.status, 400);
  });
});
