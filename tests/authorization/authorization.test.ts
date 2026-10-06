import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local before DB imports
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
import { eq } from 'drizzle-orm';
import { permissionService } from '../../src/services/authorization/permission.service';
import { scopeService } from '../../src/services/authorization/scope.service';
import { authorizationService } from '../../src/services/authorization/authorization.service';
import { passwordService } from '../../src/services/auth/password.service';
import { ForbiddenError } from '../../src/types/authorization';

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
async function getUnitId(code: string): Promise<string> {
  const [unit] = await db
    .select({ id: administrativeUnits.id })
    .from(administrativeUnits)
    .where(eq(administrativeUnits.code, code))
    .limit(1);
  if (!unit) throw new Error(`Admin unit '${code}' not found in DB`);
  return unit.id;
}

async function getRoleId(name: string): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name))
    .limit(1);
  if (!role) throw new Error(`Role '${name}' not found in DB`);
  return role.id;
}

interface TestUserConfig {
  email: string;
  roleName: string;
  unitCode: string;
}

async function createTestUser(cfg: TestUserConfig): Promise<string> {
  const hash = await passwordService.hashPassword('TestPassword@123');
  const [user] = await db
    .insert(users)
    .values({ name: `Test ${cfg.roleName}`, email: cfg.email, passwordHash: hash, status: 'ACTIVE' })
    .returning({ id: users.id });

  const roleId = await getRoleId(cfg.roleName);
  const superAdminId = await getSuperAdminId();

  await db.insert(userRoles).values({ userId: user.id, roleId, assignedBy: superAdminId }).onConflictDoNothing();

  const unitId = await getUnitId(cfg.unitCode);
  await db.insert(userAssignments).values({
    userId: user.id,
    administrativeUnitId: unitId,
    assignedBy: superAdminId,
    startDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
  });

  return user.id;
}

async function getSuperAdminId(): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
    .limit(1);
  if (!row) throw new Error('Super Admin not found');
  return row.id;
}

async function cleanupUser(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/* ----------------------------------------------------------------
 * Test suite
 * ---------------------------------------------------------------- */
describe('Authorization Foundation — Phase 1 Step 4', () => {
  // User IDs provisioned per test
  const ts = Date.now();
  let superAdminId: string;
  let centralAdminId: string;
  let karnatakaOfficerId: string;
  let bengaluruOfficerId: string;
  let bengaluruNorthOfficerId: string;
  let maharashtraOfficerId: string;
  let mysuruOfficerId: string;
  let noPermOfficerId: string; // FIELD_OFFICER inside Karnataka (limited perms)

  let unitIdKA: string;
  let unitIdKABLR: string;
  let unitIdKABLRN: string;
  let unitIdMYS: string;
  let unitIdMH: string;
  let unitIdIND: string;

  before(async () => {
    superAdminId = await getSuperAdminId();

    unitIdIND   = await getUnitId('IND');
    unitIdKA    = await getUnitId('KA');
    unitIdKABLR = await getUnitId('KA-BLR');
    unitIdKABLRN= await getUnitId('KA-BLR-N');
    unitIdMYS   = await getUnitId('KA-MYS');
    unitIdMH    = await getUnitId('MH');

    centralAdminId       = await createTestUser({ email: `auth4-central-${ts}@nlams.gov.in`,     roleName: 'MINISTRY_ADMIN',  unitCode: 'IND' });
    karnatakaOfficerId   = await createTestUser({ email: `auth4-karnataka-${ts}@nlams.gov.in`,   roleName: 'MINISTRY_ADMIN',  unitCode: 'KA' });
    bengaluruOfficerId   = await createTestUser({ email: `auth4-bengaluru-${ts}@nlams.gov.in`,   roleName: 'LAND_OFFICER',    unitCode: 'KA-BLR' });
    bengaluruNorthOfficerId = await createTestUser({ email: `auth4-blr-n-${ts}@nlams.gov.in`,    roleName: 'FIELD_OFFICER',   unitCode: 'KA-BLR-N' });
    maharashtraOfficerId = await createTestUser({ email: `auth4-maharashtra-${ts}@nlams.gov.in`, roleName: 'MINISTRY_ADMIN',  unitCode: 'MH' });
    mysuruOfficerId      = await createTestUser({ email: `auth4-mysuru-${ts}@nlams.gov.in`,      roleName: 'LAND_OFFICER',    unitCode: 'KA-MYS' });
    noPermOfficerId      = await createTestUser({ email: `auth4-noperm-${ts}@nlams.gov.in`,      roleName: 'FIELD_OFFICER',   unitCode: 'KA' });
  });

  after(async () => {
    await cleanupUser(centralAdminId);
    await cleanupUser(karnatakaOfficerId);
    await cleanupUser(bengaluruOfficerId);
    await cleanupUser(bengaluruNorthOfficerId);
    await cleanupUser(maharashtraOfficerId);
    await cleanupUser(mysuruOfficerId);
    await cleanupUser(noPermOfficerId);
    await client.end();
  });

  // ----------------------------------------------------------------
  // TEST 1: Super Admin universal scope
  // ----------------------------------------------------------------
  describe('Test 1 — Super Admin universal authority', () => {
    it('Super Admin has permission USER_CREATE', async () => {
      assert.equal(await permissionService.hasPermission(superAdminId, 'USER_CREATE'), true);
    });

    it('Super Admin isSuperAdmin() returns true', async () => {
      assert.equal(await permissionService.isSuperAdmin(superAdminId), true);
    });

    it('Super Admin is within scope of IND (Central)', async () => {
      assert.equal(await scopeService.isWithinAdministrativeScope(superAdminId, unitIdIND), true);
    });

    it('Super Admin is within scope of KA (Karnataka)', async () => {
      assert.equal(await scopeService.isWithinAdministrativeScope(superAdminId, unitIdKA), true);
    });

    it('Super Admin is within scope of KA-BLR (Bengaluru)', async () => {
      assert.equal(await scopeService.isWithinAdministrativeScope(superAdminId, unitIdKABLR), true);
    });

    it('Super Admin is within scope of MH (Maharashtra)', async () => {
      assert.equal(await scopeService.isWithinAdministrativeScope(superAdminId, unitIdMH), true);
    });

    it('Super Admin can manage Karnataka officer', async () => {
      assert.equal(
        await authorizationService.canManageUser(superAdminId, karnatakaOfficerId),
        true
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 2: Central-level (IND) user scope
  // ----------------------------------------------------------------
  describe('Test 2 — Central-level user scope', () => {
    it('Central user is within scope of Karnataka (IND → KA)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(centralAdminId, unitIdKA),
        true
      );
    });

    it('Central user is within scope of Bengaluru Urban (IND → KA → KA-BLR)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(centralAdminId, unitIdKABLR),
        true
      );
    });

    it('Central user is within scope of Maharashtra (IND → MH)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(centralAdminId, unitIdMH),
        true
      );
    });

    it('Central user has MINISTRY_ADMIN permissions (USER_CREATE, USER_ASSIGN)', async () => {
      assert.equal(await permissionService.hasPermission(centralAdminId, 'USER_CREATE'), true);
      assert.equal(await permissionService.hasPermission(centralAdminId, 'USER_ASSIGN'), true);
    });

    it('Central user can manage Karnataka officer', async () => {
      assert.equal(
        await authorizationService.canManageUser(centralAdminId, karnatakaOfficerId),
        true
      );
    });

    it('Central user can manage Bengaluru officer', async () => {
      assert.equal(
        await authorizationService.canManageUser(centralAdminId, bengaluruOfficerId),
        true
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 3: State-level (KA) user scope
  // ----------------------------------------------------------------
  describe('Test 3 — State-level (Karnataka) user scope', () => {
    it('Karnataka user is within scope of Bengaluru Urban (KA → KA-BLR)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(karnatakaOfficerId, unitIdKABLR),
        true
      );
    });

    it('Karnataka user is within scope of Mysuru (KA → KA-MYS)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(karnatakaOfficerId, unitIdMYS),
        true
      );
    });

    it('Karnataka user is within scope of Bengaluru North (KA → KA-BLR → KA-BLR-N)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(karnatakaOfficerId, unitIdKABLRN),
        true
      );
    });

    it('Karnataka user is NOT within scope of Maharashtra (KA ≠ MH)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(karnatakaOfficerId, unitIdMH),
        false
      );
    });

    it('Karnataka user can manage Bengaluru officer', async () => {
      assert.equal(
        await authorizationService.canManageUser(karnatakaOfficerId, bengaluruOfficerId),
        true
      );
    });

    it('Karnataka user cannot manage Maharashtra officer', async () => {
      assert.equal(
        await authorizationService.canManageUser(karnatakaOfficerId, maharashtraOfficerId),
        false
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 4: District-level (KA-BLR) user scope
  // ----------------------------------------------------------------
  describe('Test 4 — District-level (Bengaluru Urban) user scope', () => {
    it('Bengaluru officer is within scope of Bengaluru North (KA-BLR → KA-BLR-N)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(bengaluruOfficerId, unitIdKABLRN),
        true
      );
    });

    it('Bengaluru officer is NOT within scope of Mysuru (sibling district)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(bengaluruOfficerId, unitIdMYS),
        false
      );
    });

    it('Bengaluru officer is NOT within scope of Karnataka (parent)', async () => {
      assert.equal(
        await scopeService.isWithinAdministrativeScope(bengaluruOfficerId, unitIdKA),
        false
      );
    });

    it('Bengaluru officer cannot manage Mysuru officer (peer district)', async () => {
      assert.equal(
        await authorizationService.canManageUser(bengaluruOfficerId, mysuruOfficerId),
        false
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 5: Peer administrative unit management denied
  // ----------------------------------------------------------------
  describe('Test 5 — Peer administrative unit denied', () => {
    it('Karnataka officer cannot manage Maharashtra officer (peer state)', async () => {
      assert.equal(
        await authorizationService.canManageUser(karnatakaOfficerId, maharashtraOfficerId),
        false
      );
    });

    it('Mysuru officer cannot manage Bengaluru officer (peer district)', async () => {
      assert.equal(
        await authorizationService.canManageUser(mysuruOfficerId, bengaluruOfficerId),
        false
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 6: Lower-level cannot manage higher-level
  // ----------------------------------------------------------------
  describe('Test 6 — Higher-level target is denied for lower-level actor', () => {
    it('Bengaluru Land Officer cannot manage Karnataka Ministry Admin (higher role)', async () => {
      assert.equal(
        await authorizationService.canManageUser(bengaluruOfficerId, karnatakaOfficerId),
        false
      );
    });

    it('Bengaluru North Field Officer cannot manage Bengaluru Land Officer (higher role)', async () => {
      assert.equal(
        await authorizationService.canManageUser(bengaluruNorthOfficerId, bengaluruOfficerId),
        false
      );
    });

    it('No user (except Super Admin) can manage Super Admin', async () => {
      assert.equal(
        await authorizationService.canManageUser(centralAdminId, superAdminId),
        false
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 7: Correct scope but missing permission
  // ----------------------------------------------------------------
  describe('Test 7 — Correct scope but missing permission', () => {
    it('FIELD_OFFICER in Karnataka has no USER_CREATE permission', async () => {
      assert.equal(
        await permissionService.hasPermission(noPermOfficerId, 'USER_CREATE'),
        false
      );
    });

    it('FIELD_OFFICER cannot manage another user due to missing permission', async () => {
      assert.equal(
        await authorizationService.canManageUser(noPermOfficerId, bengaluruNorthOfficerId),
        false
      );
    });

    it('requirePermission throws ForbiddenError for missing permission', async () => {
      await assert.rejects(
        () => permissionService.requirePermission(noPermOfficerId, 'USER_CREATE'),
        (err: Error) => {
          assert.ok(err instanceof ForbiddenError);
          assert.ok(err.message.includes('USER_CREATE'));
          return true;
        }
      );
    });
  });

  // ----------------------------------------------------------------
  // TEST 8: Direct API bypass still enforces authorization
  // ----------------------------------------------------------------
  describe('Test 8 — Direct API calls enforce server-side authorization', () => {
    it('requireAdministrativeScope throws ForbiddenError when outside scope', async () => {
      await assert.rejects(
        () => scopeService.requireAdministrativeScope(karnatakaOfficerId, unitIdMH),
        (err: Error) => {
          assert.ok(err instanceof ForbiddenError, 'Should be a ForbiddenError');
          return true;
        }
      );
    });

    it('requireCanManageUser throws ForbiddenError for peer officer', async () => {
      await assert.rejects(
        () => authorizationService.requireCanManageUser(mysuruOfficerId, bengaluruOfficerId),
        (err: Error) => {
          assert.ok(err instanceof ForbiddenError, 'Should be a ForbiddenError');
          return true;
        }
      );
    });

    it('requireCanManageUser throws ForbiddenError for no-perm FIELD_OFFICER', async () => {
      await assert.rejects(
        () => authorizationService.requireCanManageUser(noPermOfficerId, bengaluruNorthOfficerId),
        (err: Error) => {
          assert.ok(err instanceof ForbiddenError, 'Should be a ForbiddenError');
          return true;
        }
      );
    });
  });

  // ----------------------------------------------------------------
  // Authorization context endpoint test
  // ----------------------------------------------------------------
  describe('GET /api/auth/permissions — authorization context endpoint', () => {
    it('resolves full authorization context for Super Admin', async () => {
      const ctx = await authorizationService.getUserAuthorizationContext(superAdminId);
      assert.ok(ctx, 'Authorization context should not be null');
      assert.ok(ctx.isSuperAdmin, 'Super Admin isSuperAdmin must be true');
      assert.ok(ctx.roles.includes('SUPER_ADMIN'), 'Should include SUPER_ADMIN role');
      assert.ok(ctx.permissions.length > 0, 'Super Admin must have permissions');
    });

    it('resolves full authorization context for Karnataka officer', async () => {
      const ctx = await authorizationService.getUserAuthorizationContext(karnatakaOfficerId);
      assert.ok(ctx, 'Authorization context should not be null');
      assert.equal(ctx.isSuperAdmin, false);
      assert.ok(ctx.roles.includes('MINISTRY_ADMIN'));
      assert.ok(ctx.assignments.length > 0, 'Should have at least one assignment');
      assert.equal(ctx.assignments[0].administrativeUnitCode, 'KA');
    });

    it('authorization context user object never exposes passwordHash', async () => {
      const ctx = await authorizationService.getUserAuthorizationContext(bengaluruOfficerId);
      assert.ok(ctx);
      assert.equal(
        (ctx.user as Record<string, unknown>).passwordHash,
        undefined,
        'passwordHash must not be in authorization context user'
      );
    });
  });

  // ----------------------------------------------------------------
  // Hierarchy traversal
  // ----------------------------------------------------------------
  describe('Administrative hierarchy traversal (CTE queries)', () => {
    it('descendants of IND include KA, KA-BLR, KA-BLR-N, KA-MYS, MH', async () => {
      const ids = await scopeService.getDescendantUnitIds(unitIdIND);
      const idSet = new Set(ids);
      assert.ok(idSet.has(unitIdIND), 'Should include self (IND)');
      assert.ok(idSet.has(unitIdKA), 'Should include KA');
      assert.ok(idSet.has(unitIdKABLR), 'Should include KA-BLR');
      assert.ok(idSet.has(unitIdKABLRN), 'Should include KA-BLR-N');
      assert.ok(idSet.has(unitIdMYS), 'Should include KA-MYS');
      assert.ok(idSet.has(unitIdMH), 'Should include MH');
    });

    it('descendants of KA do NOT include MH (peer state)', async () => {
      const ids = await scopeService.getDescendantUnitIds(unitIdKA);
      const idSet = new Set(ids);
      assert.ok(!idSet.has(unitIdMH), 'MH should NOT be a descendant of KA');
      assert.ok(!idSet.has(unitIdIND), 'IND (parent) should NOT be a descendant of KA');
    });

    it('ancestors of KA-BLR include KA and IND', async () => {
      const ids = await scopeService.getAncestorUnitIds(unitIdKABLR);
      const idSet = new Set(ids);
      assert.ok(idSet.has(unitIdKABLR), 'Should include self');
      assert.ok(idSet.has(unitIdKA), 'Should include parent KA');
      assert.ok(idSet.has(unitIdIND), 'Should include grandparent IND');
    });

    it('ancestors of KA-BLR do NOT include MH (peer state)', async () => {
      const ids = await scopeService.getAncestorUnitIds(unitIdKABLR);
      const idSet = new Set(ids);
      assert.ok(!idSet.has(unitIdMH), 'MH should not be an ancestor of KA-BLR');
    });
  });
});
