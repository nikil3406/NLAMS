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
import {
  competentAuthorities,
  authorityJurisdictions,
  authorityUserAssignments,
} from '../../db/schema/competent-authorities';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';
import { ROLE_AUTHORITY_WEIGHT } from '../../src/services/authorization/authorization.service';

// Route Handlers
import { GET as usersGetHandler, POST as usersPostHandler } from '../../src/app/api/users/route';
import { GET as userDetailGetHandler } from '../../src/app/api/users/[id]/route';
import { DELETE as userRoleDeleteHandler } from '../../src/app/api/users/[id]/roles/[roleId]/route';
import {
  GET as userAuthAssignmentsGetHandler,
  POST as userAuthAssignmentsPostHandler,
} from '../../src/app/api/users/[id]/authority-assignments/route';
import { PATCH as userAuthAssignmentPatchHandler } from '../../src/app/api/users/[id]/authority-assignments/[assignmentId]/route';
import { GET as reviewsGetHandler } from '../../src/app/api/competent-authorities/reviews/route';
import { GET as myAuthoritiesGetHandler } from '../../src/app/api/competent-authorities/my-authorities/route';

describe('NLAMS – COMPETENT_AUTHORITY Role and User Management', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdAuthorityIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let roleSuperAdminId: string;
  let roleMinistryAdminId: string;
  let roleCompetentAuthorityId: string;
  let roleLandOfficerId: string;

  let unitKA: string;
  let unitKABLR: string;

  let activeAuthorityId1: string;
  let activeAuthorityId2: string;
  let inactiveAuthorityId: string;

  function makeReq(
    method: string,
    url: string,
    cookie?: string,
    body?: Record<string, unknown>
  ): NextRequest {
    const headers = new Headers();
    if (cookie) headers.set('cookie', `${authConfig.cookieName}=${cookie}`);
    if (body) headers.set('content-type', 'application/json');

    return new NextRequest(new URL(url, 'http://localhost'), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function createTestUser(opts: {
    email: string;
    roleId: string;
    unitId: string;
  }): Promise<{ id: string; cookie: string }> {
    const pwdHash = await passwordService.hashPassword('Password123!');
    const [u] = await db
      .insert(users)
      .values({
        name: `Test User ${opts.email}`,
        email: opts.email,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      })
      .returning();

    createdUserIds.push(u.id);

    await db.insert(userRoles).values({
      userId: u.id,
      roleId: opts.roleId,
      assignedBy: u.id,
    });

    await db.insert(userAssignments).values({
      userId: u.id,
      administrativeUnitId: opts.unitId,
      assignedBy: u.id,
      startDate: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
    });

    const { token } = await sessionService.createSession(u.id);
    return { id: u.id, cookie: token };
  }

  before(async () => {
    // 1. Fetch administrative units
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [blr] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA-BLR')).limit(1);
    unitKA = ka.id;
    unitKABLR = blr.id;

    // 2. Fetch roles
    const [saRole] = await db.select().from(roles).where(eq(roles.name, 'SUPER_ADMIN')).limit(1);
    const [maRole] = await db.select().from(roles).where(eq(roles.name, 'MINISTRY_ADMIN')).limit(1);
    const [caRole] = await db.select().from(roles).where(eq(roles.name, 'COMPETENT_AUTHORITY')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);

    roleSuperAdminId = saRole.id;
    roleMinistryAdminId = maRole.id;
    roleCompetentAuthorityId = caRole.id;
    roleLandOfficerId = loRole.id;

    // 3. Create actors
    const sa = await createTestUser({
      email: `ca-sa-${ts}@nlams.gov.in`,
      roleId: roleSuperAdminId,
      unitId: unitKA,
    });
    superAdminId = sa.id;
    superAdminCookie = sa.cookie;

    const ma = await createTestUser({
      email: `ca-ma-${ts}@nlams.gov.in`,
      roleId: roleMinistryAdminId,
      unitId: unitKA,
    });
    ministryAdminId = ma.id;
    ministryAdminCookie = ma.cookie;

    const lo = await createTestUser({
      email: `ca-lo-${ts}@nlams.gov.in`,
      roleId: roleLandOfficerId,
      unitId: unitKABLR,
    });
    landOfficerId = lo.id;
    landOfficerCookie = lo.cookie;

    // 4. Create active and inactive Competent Authority records
    const today = new Date().toISOString().slice(0, 10);

    const [auth1] = await db
      .insert(competentAuthorities)
      .values({
        authorityCode: `AUTH-BLR-DC-${ts}`,
        authorityName: `Bengaluru Urban District Collector ${ts}`,
        designation: 'District Collector & District Magistrate',
        authorityLevel: 'DISTRICT',
        status: 'ACTIVE',
        effectiveFrom: today,
      })
      .returning();
    activeAuthorityId1 = auth1.id;
    createdAuthorityIds.push(auth1.id);

    await db.insert(authorityJurisdictions).values({
      authorityId: auth1.id,
      stateId: unitKA,
      districtId: unitKABLR,
      effectiveFrom: today,
      status: 'ACTIVE',
    });

    const [auth2] = await db
      .insert(competentAuthorities)
      .values({
        authorityCode: `AUTH-DIV-COMM-${ts}`,
        authorityName: `Bengaluru Divisional Commissioner ${ts}`,
        designation: 'Divisional Commissioner',
        authorityLevel: 'REGIONAL',
        status: 'ACTIVE',
        effectiveFrom: today,
      })
      .returning();
    activeAuthorityId2 = auth2.id;
    createdAuthorityIds.push(auth2.id);

    await db.insert(authorityJurisdictions).values({
      authorityId: auth2.id,
      stateId: unitKA,
      districtId: unitKABLR,
      effectiveFrom: today,
      status: 'ACTIVE',
    });

    const [inactiveAuth] = await db
      .insert(competentAuthorities)
      .values({
        authorityCode: `AUTH-INACTIVE-${ts}`,
        authorityName: `Retired Authority ${ts}`,
        designation: 'Special Land Acquisition Officer',
        authorityLevel: 'DISTRICT',
        status: 'INACTIVE',
        effectiveFrom: '2020-01-01',
      })
      .returning();
    inactiveAuthorityId = inactiveAuth.id;
    createdAuthorityIds.push(inactiveAuth.id);
  });

  after(async () => {
    // Teardown
    if (createdUserIds.length > 0) {
      await db.delete(authorityUserAssignments).where(inArray(authorityUserAssignments.userId, createdUserIds));
      await db.delete(userAssignments).where(inArray(userAssignments.userId, createdUserIds));
      await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }

    if (createdAuthorityIds.length > 0) {
      await db.delete(authorityJurisdictions).where(inArray(authorityJurisdictions.authorityId, createdAuthorityIds));
      await db.delete(competentAuthorities).where(inArray(competentAuthorities.id, createdAuthorityIds));
    }

    await client.end();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Role System Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Role Configuration & Authority Weight', () => {
    it('1.1 COMPETENT_AUTHORITY role exists in database as system role', async () => {
      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'COMPETENT_AUTHORITY'))
        .limit(1);

      assert.ok(role, 'COMPETENT_AUTHORITY role must exist');
      assert.equal(role.isSystemRole, true);
    });

    it('1.2 Relative authority weight is configured appropriately', () => {
      assert.equal(ROLE_AUTHORITY_WEIGHT.SUPER_ADMIN, 100);
      assert.equal(ROLE_AUTHORITY_WEIGHT.MINISTRY_ADMIN, 80);
      assert.equal(ROLE_AUTHORITY_WEIGHT.COMPETENT_AUTHORITY, 70);
      assert.equal(ROLE_AUTHORITY_WEIGHT.PROJECT_OFFICER, 60);
      assert.equal(ROLE_AUTHORITY_WEIGHT.LAND_OFFICER, 40);

      // Super Admin and Ministry Admin can manage Competent Authority
      assert.ok(ROLE_AUTHORITY_WEIGHT.SUPER_ADMIN > ROLE_AUTHORITY_WEIGHT.COMPETENT_AUTHORITY);
      assert.ok(ROLE_AUTHORITY_WEIGHT.MINISTRY_ADMIN > ROLE_AUTHORITY_WEIGHT.COMPETENT_AUTHORITY);
      // Project Officer and Land Officer cannot manage Competent Authority
      assert.ok(ROLE_AUTHORITY_WEIGHT.PROJECT_OFFICER < ROLE_AUTHORITY_WEIGHT.COMPETENT_AUTHORITY);
      assert.ok(ROLE_AUTHORITY_WEIGHT.LAND_OFFICER < ROLE_AUTHORITY_WEIGHT.COMPETENT_AUTHORITY);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. User Creation with COMPETENT_AUTHORITY Role
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. User Creation with COMPETENT_AUTHORITY Role', () => {
    it('2.1 Rejects creation with COMPETENT_AUTHORITY role when competentAuthorityId is missing (400)', async () => {
      const req = makeReq('POST', 'http://localhost/api/users', superAdminCookie, {
        name: 'Officer Without Authority',
        email: `no-auth-${ts}@nlams.gov.in`,
        roleId: roleCompetentAuthorityId,
        administrativeUnitId: unitKA,
      });

      const res = await usersPostHandler(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.match(json.error, /Competent Authority selection is required/i);
    });

    it('2.2 Rejects creation when competentAuthorityId does not exist in DB (404)', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000099';
      const req = makeReq('POST', 'http://localhost/api/users', superAdminCookie, {
        name: 'Officer With Bad Authority',
        email: `bad-auth-${ts}@nlams.gov.in`,
        roleId: roleCompetentAuthorityId,
        administrativeUnitId: unitKA,
        competentAuthorityId: nonExistentId,
      });

      const res = await usersPostHandler(req);
      assert.equal(res.status, 404);
      const json = await res.json();
      assert.match(json.error, /does not exist/i);
    });

    it('2.3 Rejects creation when competentAuthorityId is INACTIVE (400)', async () => {
      const req = makeReq('POST', 'http://localhost/api/users', superAdminCookie, {
        name: 'Officer With Inactive Authority',
        email: `inactive-auth-${ts}@nlams.gov.in`,
        roleId: roleCompetentAuthorityId,
        administrativeUnitId: unitKA,
        competentAuthorityId: inactiveAuthorityId,
      });

      const res = await usersPostHandler(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.match(json.error, /INACTIVE/i);
    });

    it('2.4 Rejects creation by unauthorized user (Land Officer - 403 Forbidden)', async () => {
      const req = makeReq('POST', 'http://localhost/api/users', landOfficerCookie, {
        name: 'Officer Attempted by Land Officer',
        email: `unauth-create-${ts}@nlams.gov.in`,
        roleId: roleCompetentAuthorityId,
        administrativeUnitId: unitKABLR,
        competentAuthorityId: activeAuthorityId1,
      });

      const res = await usersPostHandler(req);
      assert.equal(res.status, 403);
    });

    let createdCAUserId: string;
    let createdCAUserCookie: string;

    it('2.5 Authorized administrator creates COMPETENT_AUTHORITY user successfully (201)', async () => {
      const userEmail = `ca-officer-${ts}@nlams.gov.in`;
      const req = makeReq('POST', 'http://localhost/api/users', ministryAdminCookie, {
        name: 'Sri R. K. Sharma, DC',
        email: userEmail,
        phone: '+91 9876543210',
        roleId: roleCompetentAuthorityId,
        administrativeUnitId: unitKA,
        competentAuthorityId: activeAuthorityId1,
      });

      const res = await usersPostHandler(req);
      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.email, userEmail);

      createdCAUserId = json.data.id;
      createdUserIds.push(createdCAUserId);

      // Verify session creation for subsequent tests
      const { token } = await sessionService.createSession(createdCAUserId);
      createdCAUserCookie = token;

      // Verify database record in authority_user_assignments
      const [assignment] = await db
        .select()
        .from(authorityUserAssignments)
        .where(
          eq(authorityUserAssignments.userId, createdCAUserId)
        );

      assert.ok(assignment, 'authority_user_assignments record must be created');
      assert.equal(assignment.authorityId, activeAuthorityId1);
      assert.equal(assignment.status, 'ACTIVE');
      assert.equal(assignment.assignedBy, ministryAdminId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. User Listing & Details Integration
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. User Details & Listing with Authority Association', () => {
      it('3.1 User details endpoint returns authorityAssignments array', async () => {
        const req = makeReq('GET', `http://localhost/api/users/${createdCAUserId}`, superAdminCookie);
        const res = await userDetailGetHandler(req, {
          params: Promise.resolve({ id: createdCAUserId }),
        });

        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.success, true);
        assert.ok(Array.isArray(json.data.authorityAssignments));
        assert.equal(json.data.authorityAssignments.length, 1);

        const authAssign = json.data.authorityAssignments[0];
        assert.equal(authAssign.authorityId, activeAuthorityId1);
        assert.equal(authAssign.status, 'ACTIVE');
        assert.equal(authAssign.authorityCode, `AUTH-BLR-DC-${ts}`);
        assert.equal(authAssign.designation, 'District Collector & District Magistrate');
      });

      it('3.2 User listing endpoint includes authorityAssignments in user records', async () => {
        const req = makeReq('GET', `http://localhost/api/users?search=ca-officer-${ts}`, superAdminCookie);
        const res = await usersGetHandler(req);

        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.success, true);
        const found = json.data.find((u: { id: string }) => u.id === createdCAUserId);
        assert.ok(found, 'Created CA user must be found in listing');
        assert.ok(Array.isArray(found.authorityAssignments));
        assert.equal(found.authorityAssignments[0].authorityId, activeAuthorityId1);
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Updating & Managing Authority Assignments
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Authority Assignment Modification & History Preservation', () => {
      let initialAssignmentId: string;

      it('4.1 GET /api/users/[id]/authority-assignments lists user assignments', async () => {
        const req = makeReq(
          'GET',
          `http://localhost/api/users/${createdCAUserId}/authority-assignments`,
          superAdminCookie
        );
        const res = await userAuthAssignmentsGetHandler(req, {
          params: Promise.resolve({ id: createdCAUserId }),
        });

        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.success, true);
        assert.equal(json.data.length, 1);
        initialAssignmentId = json.data[0].id;
      });

      it('4.2 POST /api/users/[id]/authority-assignments switches authority, superseding previous assignment', async () => {
        const req = makeReq(
          'POST',
          `http://localhost/api/users/${createdCAUserId}/authority-assignments`,
          ministryAdminCookie,
          { authorityId: activeAuthorityId2 }
        );

        const res = await userAuthAssignmentsPostHandler(req, {
          params: Promise.resolve({ id: createdCAUserId }),
        });

        assert.equal(res.status, 201);
        const json = await res.json();
        assert.equal(json.success, true);
        assert.equal(json.data.authorityId, activeAuthorityId2);
        assert.equal(json.data.status, 'ACTIVE');

        // Check history preservation in database: both records exist
        const allAssignments = await db
          .select()
          .from(authorityUserAssignments)
          .where(eq(authorityUserAssignments.userId, createdCAUserId));

        assert.equal(allAssignments.length, 2, 'Historical assignment must not be deleted');
        const oldAssign = allAssignments.find((a) => a.id === initialAssignmentId);
        assert.ok(oldAssign);
        assert.equal(oldAssign.status, 'INACTIVE', 'Previous assignment must be marked INACTIVE');
      });

      it('4.3 PATCH /api/users/[id]/authority-assignments/[assignmentId] deactivates the assignment', async () => {
        // Fetch current active assignment
        const assignments = await db
          .select()
          .from(authorityUserAssignments)
          .where(eq(authorityUserAssignments.userId, createdCAUserId));

        const currentActive = assignments.find((a) => a.status === 'ACTIVE');
        assert.ok(currentActive);

        const req = makeReq(
          'PATCH',
          `http://localhost/api/users/${createdCAUserId}/authority-assignments/${currentActive.id}`,
          ministryAdminCookie,
          { status: 'INACTIVE' }
        );

        const res = await userAuthAssignmentPatchHandler(req, {
          params: Promise.resolve({ id: createdCAUserId, assignmentId: currentActive.id }),
        });

        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.success, true);
        assert.equal(json.data.status, 'INACTIVE');
      });

      it('4.4 User with role but NO active assignment cannot access review dashboard (403)', async () => {
        const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', createdCAUserCookie);
        const res = await reviewsGetHandler(req);

        assert.equal(res.status, 403, 'Inactive assignment must block review dashboard access');
      });

      it('4.5 Reactivating assignment restores access to review dashboard (200)', async () => {
        // Fetch the second assignment and reactivate it
        const assignments = await db
          .select()
          .from(authorityUserAssignments)
          .where(eq(authorityUserAssignments.userId, createdCAUserId));

        const assignToReactivate = assignments.find((a) => a.authorityId === activeAuthorityId2);
        assert.ok(assignToReactivate);

        const req = makeReq(
          'PATCH',
          `http://localhost/api/users/${createdCAUserId}/authority-assignments/${assignToReactivate.id}`,
          ministryAdminCookie,
          { status: 'ACTIVE' }
        );

        const res = await userAuthAssignmentPatchHandler(req, {
          params: Promise.resolve({ id: createdCAUserId, assignmentId: assignToReactivate.id }),
        });

        assert.equal(res.status, 200);

        // Now review dashboard access succeeds
        const revReq = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', createdCAUserCookie);
        const revRes = await reviewsGetHandler(revReq);
        assert.equal(revRes.status, 200, 'Reactivated assignment restores review dashboard access');
      });

      it('4.6 User with assignment but WITHOUT COMPETENT_AUTHORITY role cannot access review dashboard (403)', async () => {
        // Create user with LAND_OFFICER role but manually give authority assignment
        const dummy = await createTestUser({
          email: `dummy-no-role-${ts}@nlams.gov.in`,
          roleId: roleLandOfficerId,
          unitId: unitKA,
        });

        await db.insert(authorityUserAssignments).values({
          authorityId: activeAuthorityId1,
          userId: dummy.id,
          assignedBy: superAdminId,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          status: 'ACTIVE',
        });

        const req = makeReq('GET', 'http://localhost/api/competent-authorities/reviews', dummy.cookie);
        const res = await reviewsGetHandler(req);

        assert.equal(res.status, 403, 'User without COMPETENT_AUTHORITY role must be denied review access');
      });

      it('4.7 Revoking COMPETENT_AUTHORITY role deactivates active authority assignments', async () => {
        // First assign a temporary role (LAND_OFFICER) so revoking CA doesn't leave user with 0 roles
        await db.insert(userRoles).values({
          userId: createdCAUserId,
          roleId: roleLandOfficerId,
          assignedBy: superAdminId,
        });

        const req = makeReq(
          'DELETE',
          `http://localhost/api/users/${createdCAUserId}/roles/${roleCompetentAuthorityId}`,
          superAdminCookie
        );

        const res = await userRoleDeleteHandler(req, {
          params: Promise.resolve({ id: createdCAUserId, roleId: roleCompetentAuthorityId }),
        });

        assert.equal(res.status, 200);

        // Verify active assignments are now deactivated
        const assignments = await db
          .select()
          .from(authorityUserAssignments)
          .where(eq(authorityUserAssignments.userId, createdCAUserId));

        const activeCount = assignments.filter((a) => a.status === 'ACTIVE').length;
        assert.equal(activeCount, 0, 'Revoking role must deactivate all active authority assignments');
      });

      it('4.8 my-authorities endpoint returns empty list for user without COMPETENT_AUTHORITY role', async () => {
        const req = makeReq('GET', 'http://localhost/api/competent-authorities/my-authorities', createdCAUserCookie);
        const res = await myAuthoritiesGetHandler(req);

        assert.equal(res.status, 200);
        const json = await res.json();
        assert.deepEqual(json.data, [], 'User without role must receive empty authorities array');
      });
    });
  });
});
