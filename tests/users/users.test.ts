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
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { GET as usersGetHandler, POST as usersPostHandler } from '../../src/app/api/users/route';
import { GET as userDetailGetHandler, PATCH as userDetailPatchHandler } from '../../src/app/api/users/[id]/route';
import { POST as userRolesPostHandler } from '../../src/app/api/users/[id]/roles/route';
import { DELETE as userRoleDeleteHandler } from '../../src/app/api/users/[id]/roles/[roleId]/route';
import { POST as userAssignmentsPostHandler } from '../../src/app/api/users/[id]/assignments/route';
import { PATCH as userAssignmentPatchHandler } from '../../src/app/api/users/[id]/assignments/[assignmentId]/route';

describe('NLAMS User & Authority Management — Phase 2 Step 2', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let karnatakaAdminId: string;
  let karnatakaAdminCookie: string;

  let maharashtraAdminId: string;
  let maharashtraAdminCookie: string;

  let blrOfficerId: string;
  let blrOfficerCookie: string;

  let mysuruOfficerId: string;
  let mysuruOfficerCookie: string;

  let fieldOfficerId: string;
  let fieldOfficerCookie: string;

  let roleSuperAdminId: string;
  let roleMinistryAdminId: string;
  let roleLandOfficerId: string;
  let roleFieldOfficerId: string;

  let unitIND: string;
  let unitKA: string;
  let unitKABLR: string;
  let unitKAMYS: string;
  let unitMH: string;

  before(async () => {
    // 1. Fetch administrative units
    const [ind] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'IND')).limit(1);
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [blr] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA-BLR')).limit(1);
    const [mys] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA-MYS')).limit(1);
    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);

    unitIND = ind.id;
    unitKA = ka.id;
    unitKABLR = blr.id;
    unitKAMYS = mys.id;
    unitMH = mh.id;

    // 2. Fetch roles
    const [saRole] = await db.select().from(roles).where(eq(roles.name, 'SUPER_ADMIN')).limit(1);
    const [maRole] = await db.select().from(roles).where(eq(roles.name, 'MINISTRY_ADMIN')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    const [foRole] = await db.select().from(roles).where(eq(roles.name, 'FIELD_OFFICER')).limit(1);

    roleSuperAdminId = saRole.id;
    roleMinistryAdminId = maRole.id;
    roleLandOfficerId = loRole.id;
    roleFieldOfficerId = foRole.id;

    // Helper to create user + role + assignment + session
    async function setupTestActor(name: string, email: string, roleId: string, unitId: string) {
      const passwordHash = await passwordService.hashPassword('ActorPassword123!');
      const [u] = await db
        .insert(users)
        .values({ name, email, passwordHash, status: 'ACTIVE' })
        .returning();
      createdUserIds.push(u.id);

      await db.insert(userRoles).values({ userId: u.id, roleId, assignedBy: u.id });
      await db.insert(userAssignments).values({
        userId: u.id,
        administrativeUnitId: unitId,
        assignedBy: u.id,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });

      const { token } = await sessionService.createSession(u.id);
      return { id: u.id, cookie: `${authConfig.cookieName}=${token}` };
    }

    // Super Admin
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    superAdminId = sa.id;
    const { token: saToken } = await sessionService.createSession(superAdminId);
    superAdminCookie = `${authConfig.cookieName}=${saToken}`;

    // Karnataka State Admin
    const kaActor = await setupTestActor('KA Admin', `ka.admin.${ts}@nlams.test`, roleMinistryAdminId, unitKA);
    karnatakaAdminId = kaActor.id;
    karnatakaAdminCookie = kaActor.cookie;

    // Maharashtra State Admin
    const mhActor = await setupTestActor('MH Admin', `mh.admin.${ts}@nlams.test`, roleMinistryAdminId, unitMH);
    maharashtraAdminId = mhActor.id;
    maharashtraAdminCookie = mhActor.cookie;

    // Bengaluru District Land Officer
    const blrActor = await setupTestActor('BLR Officer', `blr.officer.${ts}@nlams.test`, roleLandOfficerId, unitKABLR);
    blrOfficerId = blrActor.id;
    blrOfficerCookie = blrActor.cookie;

    // Mysuru District Land Officer
    const mysActor = await setupTestActor('MYS Officer', `mys.officer.${ts}@nlams.test`, roleLandOfficerId, unitKAMYS);
    mysuruOfficerId = mysActor.id;
    mysuruOfficerCookie = mysActor.cookie;


    // Field Officer in Bengaluru (no user management permissions)
    const foActor = await setupTestActor('Field Officer', `fo.officer.${ts}@nlams.test`, roleFieldOfficerId, unitKABLR);
    fieldOfficerId = foActor.id;
    fieldOfficerCookie = foActor.cookie;
  });

  after(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
      await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await client.end();
  });

  // Scenario 1: Authorized user creates a subordinate user
  it('1. Authorized state-level user creates a subordinate district user', async () => {
    const email = `blr.subordinate.${ts}@nlams.test`;
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        cookie: karnatakaAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bengaluru Subordinate Officer',
        email,
        phone: '+91 9876543210',
        roleId: roleLandOfficerId,
        administrativeUnitId: unitKABLR,
      }),
    });

    const res = await usersPostHandler(req);
    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, 'Bengaluru Subordinate Officer');
    assert.equal(body.data.email, email);
    assert.ok(body.temporaryPassword);
    assert.equal(body.data.passwordHash, undefined, 'passwordHash must never be exposed');

    createdUserIds.push(body.data.id);
  });

  // Scenario 2: Unauthorized user cannot create users
  it('2. Unauthorized user (FIELD_OFFICER) cannot create users (403 Forbidden)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        cookie: fieldOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Illegal User',
        email: `illegal.${ts}@nlams.test`,
        roleId: roleFieldOfficerId,
        administrativeUnitId: unitKABLR,
      }),
    });

    const res = await usersPostHandler(req);
    assert.equal(res.status, 403);
  });

  // Scenario 3: User cannot create another user outside their scope
  it('3. Karnataka user cannot create a user in Maharashtra (outside scope)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        cookie: karnatakaAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Cross Scope User',
        email: `cross.scope.${ts}@nlams.test`,
        roleId: roleLandOfficerId,
        administrativeUnitId: unitMH,
      }),
    });

    const res = await usersPostHandler(req);
    assert.equal(res.status, 403);
  });

  // Scenario 4: State-level user cannot manage another state's users
  it('4. Karnataka admin cannot access or manage Maharashtra admin user details (404/403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${maharashtraAdminId}`, {
      headers: { cookie: karnatakaAdminCookie },
    });

    const res = await userDetailGetHandler(req, {
      params: Promise.resolve({ id: maharashtraAdminId }),
    });
    assert.equal(res.status, 404, 'Must return 404 to avoid leaking existence of out-of-scope user');
  });

  // Scenario 5: District-level user cannot manage a peer district's users
  it('5. Bengaluru officer cannot update or access Mysuru officer (peer district)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${mysuruOfficerId}`, {
      method: 'PATCH',
      headers: {
        cookie: blrOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });

    const res = await userDetailPatchHandler(req, {
      params: Promise.resolve({ id: mysuruOfficerId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 6: Lower-level user cannot manage a superior user
  it('6. Bengaluru Land Officer cannot modify Karnataka Ministry Admin', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${karnatakaAdminId}`, {
      method: 'PATCH',
      headers: {
        cookie: blrOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });

    const res = await userDetailPatchHandler(req, {
      params: Promise.resolve({ id: karnatakaAdminId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 7: User cannot assign Super Admin or another unauthorized role
  it('7. Karnataka Ministry Admin cannot assign SUPER_ADMIN role (403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}/roles`, {
      method: 'POST',
      headers: {
        cookie: karnatakaAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roleId: roleSuperAdminId }),
    });

    const res = await userRolesPostHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 8: User without role-assignment permission cannot change roles
  it('8. Field Officer cannot assign roles (missing ROLE_ASSIGN -> 403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}/roles`, {
      method: 'POST',
      headers: {
        cookie: fieldOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roleId: roleFieldOfficerId }),
    });

    const res = await userRolesPostHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 9: User cannot modify their own privileges through request payloads
  it('9. User cannot assign roles to themselves (self privilege escalation denied)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${karnatakaAdminId}/roles`, {
      method: 'POST',
      headers: {
        cookie: karnatakaAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roleId: roleLandOfficerId }),
    });

    const res = await userRolesPostHandler(req, {
      params: Promise.resolve({ id: karnatakaAdminId }),
    });
    assert.equal(res.status, 403);
  });

  it('9b. User cannot modify their own administrative unit assignments', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${karnatakaAdminId}/assignments`, {
      method: 'POST',
      headers: {
        cookie: karnatakaAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ administrativeUnitId: unitIND }),
    });

    const res = await userAssignmentsPostHandler(req, {
      params: Promise.resolve({ id: karnatakaAdminId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 10: Duplicate email is rejected
  it('10. Duplicate email is rejected with 409 Conflict', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Duplicate Email User',
        email: `ka.admin.${ts}@nlams.test`, // Already created in before()
        roleId: roleFieldOfficerId,
        administrativeUnitId: unitKA,
      }),
    });

    const res = await usersPostHandler(req);
    assert.equal(res.status, 409);
  });

  // Scenario 11: Invalid administrative assignment is rejected
  it('11. Non-existent administrative unit assignment is rejected with 404', async () => {
    const fakeUnitId = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}/assignments`, {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ administrativeUnitId: fakeUnitId }),
    });

    const res = await userAssignmentsPostHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 404);
  });

  // Scenario 12: Passwords are hashed and never returned
  it('12. User details and listings never expose password_hash or internal secrets', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}`, {
      headers: { cookie: superAdminCookie },
    });

    const res = await userDetailGetHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.data.passwordHash, undefined);
    assert.equal(body.data.password_hash, undefined);
  });

  // Scenario 13: Unauthenticated API requests return 401
  it('13. Unauthenticated requests to /api/users return 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/users');
    const res = await usersGetHandler(req);
    assert.equal(res.status, 401);
  });

  // Scenario 14: Direct API calls cannot bypass frontend restrictions
  it('14. Direct API call to modify status without USER_UPDATE returns 403', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}`, {
      method: 'PATCH',
      headers: {
        cookie: fieldOfficerCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });

    const res = await userDetailPatchHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 403);
  });

  // Scenario 15: Unauthorized users cannot access user details by guessing IDs
  it('15. Unauthorized cross-state user guessing IDs gets 404', async () => {
    const req = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}`, {
      headers: { cookie: maharashtraAdminCookie },
    });

    const res = await userDetailGetHandler(req, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(res.status, 404);
  });

  // Scope-restricted User Listing verification
  it('Scope-restricted user listing: Karnataka admin sees only Karnataka subordinate users', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      headers: { cookie: karnatakaAdminCookie },
    });

    const res = await usersGetHandler(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));

    // Must NOT contain Maharashtra admin
    const containsMh = body.data.some((u: { id: string }) => u.id === maharashtraAdminId);
    assert.equal(containsMh, false, 'Karnataka admin must not see Maharashtra admin in user list');

    // Must contain Bengaluru officer
    const containsBlr = body.data.some((u: { id: string }) => u.id === blrOfficerId);
    assert.equal(containsBlr, true, 'Karnataka admin should see Bengaluru subordinate officer');
  });

  // Administrative assignment modification
  it('Assignment update: modifying assignment status works when authorized', async () => {
    // 1. Fetch user assignments
    const getReq = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}`, {
      headers: { cookie: karnatakaAdminCookie },
    });
    const getRes = await userDetailGetHandler(getReq, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    const getBody = await getRes.json();
    const assignment = getBody.data.assignments[0];
    assert.ok(assignment, 'Expected an assignment to exist');

    // 2. Patch assignment status to INACTIVE
    const patchReq = new NextRequest(
      `http://localhost:3000/api/users/${blrOfficerId}/assignments/${assignment.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: karnatakaAdminCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'INACTIVE', endDate: '2026-12-31' }),
      }
    );

    const patchRes = await userAssignmentPatchHandler(patchReq, {
      params: Promise.resolve({ id: blrOfficerId, assignmentId: assignment.id }),
    });
    assert.equal(patchRes.status, 200);

    const patchBody = await patchRes.json();
    const updatedAssignment = patchBody.data.assignments.find((a: { id: string }) => a.id === assignment.id);
    assert.equal(updatedAssignment.status, 'INACTIVE');
    assert.equal(updatedAssignment.endDate, '2026-12-31');
  });

  // Role Revocation verification
  it('Role revocation: Super Admin can revoke a secondary role from user', async () => {
    // 1. Assign FIELD_OFFICER role to blr officer
    const assignReq = new NextRequest(`http://localhost:3000/api/users/${blrOfficerId}/roles`, {
      method: 'POST',
      headers: {
        cookie: superAdminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roleId: roleFieldOfficerId }),
    });
    const assignRes = await userRolesPostHandler(assignReq, {
      params: Promise.resolve({ id: blrOfficerId }),
    });
    assert.equal(assignRes.status, 200);

    // 2. Revoke the role
    const revokeReq = new NextRequest(
      `http://localhost:3000/api/users/${blrOfficerId}/roles/${roleFieldOfficerId}`,
      {
        method: 'DELETE',
        headers: { cookie: superAdminCookie },
      }
    );
    const revokeRes = await userRoleDeleteHandler(revokeReq, {
      params: Promise.resolve({ id: blrOfficerId, roleId: roleFieldOfficerId }),
    });
    assert.equal(revokeRes.status, 200);

    const revokeBody = await revokeRes.json();
    assert.equal(
      revokeBody.data.roles.some((r: { id: string }) => r.id === roleFieldOfficerId),
      false
    );
  });
});
