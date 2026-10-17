import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
import { passwordService } from '../../src/services/auth/password.service';
import {
  administrativeUnitService,
  administrativeUnitTreeService,
} from '../../src/services/administrative-units';
import { administrativeUnitRepository } from '../../src/repositories/administrative-unit.repository';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../../src/types/errors';

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

async function getSuperAdminId(): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
    .limit(1);
  if (!row) throw new Error('Super Admin not found');
  return row.id;
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

async function cleanupUser(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

describe('Administrative Hierarchy Foundation — Phase 2 Step 1', () => {
  const ts = Date.now();
  let superAdminId: string;
  let karnatakaAdminId: string;
  let fieldOfficerId: string;

  let unitIdIND: string;
  let unitIdKA: string;
  let unitIdKABLR: string;
  let unitIdMH: string;

  const createdTestUnitCodes: string[] = [];

  before(async () => {
    superAdminId = await getSuperAdminId();

    unitIdIND = await getUnitId('IND');
    unitIdKA = await getUnitId('KA');
    unitIdKABLR = await getUnitId('KA-BLR');
    unitIdMH = await getUnitId('MH');

    karnatakaAdminId = await createTestUser({
      email: `admin-hierarchy-ka-${ts}@nlams.gov.in`,
      roleName: 'MINISTRY_ADMIN',
      unitCode: 'KA',
    });

    fieldOfficerId = await createTestUser({
      email: `admin-hierarchy-fo-${ts}@nlams.gov.in`,
      roleName: 'FIELD_OFFICER',
      unitCode: 'KA',
    });
  });

  after(async () => {
    // Cleanup created test units
    if (createdTestUnitCodes.length > 0) {
      await db
        .delete(administrativeUnits)
        .where(inArray(administrativeUnits.code, createdTestUnitCodes));
    }

    await cleanupUser(karnatakaAdminId);
    await cleanupUser(fieldOfficerId);
    await client.end();
  });

  describe('Repository Operations', () => {
    it('getAdministrativeUnitById returns the unit record', async () => {
      const unit = await administrativeUnitRepository.getAdministrativeUnitById(unitIdIND);
      assert.ok(unit);
      assert.strictEqual(unit.code, 'IND');
      assert.strictEqual(unit.type, 'CENTRAL');
    });

    it('getRootAdministrativeUnits returns top-level units with parent_id null', async () => {
      const roots = await administrativeUnitRepository.getRootAdministrativeUnits();
      assert.ok(roots.length >= 1);
      assert.ok(roots.some((r) => r.code === 'IND'));
      for (const r of roots) {
        assert.strictEqual(r.parentId, null);
      }
    });

    it('getChildAdministrativeUnits returns direct children', async () => {
      const children = await administrativeUnitRepository.getChildAdministrativeUnits(unitIdKA);
      assert.ok(children.length >= 1);
      assert.ok(children.some((c) => c.code === 'KA-BLR'));
      for (const c of children) {
        assert.strictEqual(c.parentId, unitIdKA);
      }
    });

    it('getAdministrativeUnitAncestors returns ordered ancestors from root to parent', async () => {
      const ancestors = await administrativeUnitRepository.getAdministrativeUnitAncestors(unitIdKABLR);
      assert.ok(ancestors.length >= 2);
      // IND -> KA -> KA-BLR, so ancestors are IND and KA
      assert.strictEqual(ancestors[0].code, 'IND');
      assert.strictEqual(ancestors[1].code, 'KA');
    });

    it('getAdministrativeUnitDescendants returns subordinate units', async () => {
      const descendants = await administrativeUnitRepository.getAdministrativeUnitDescendants(unitIdKA);
      assert.ok(descendants.length >= 2);
      const codes = descendants.map((d) => d.code);
      assert.ok(codes.includes('KA-BLR'));
      assert.ok(codes.includes('KA-BLR-N'));
      assert.ok(!codes.includes('MH'));
    });
  });

  describe('Service: Unit Creation', () => {
    it('Super Admin creates an administrative unit successfully', async () => {
      const testCode = `TEST-DIST-${ts}`;
      createdTestUnitCodes.push(testCode);

      const created = await administrativeUnitService.createAdministrativeUnit(
        {
          name: 'Test District Unit',
          code: testCode,
          type: 'DISTRICT',
          parentId: unitIdKA,
          status: 'ACTIVE',
        },
        superAdminId
      );

      assert.ok(created);
      assert.strictEqual(created.name, 'Test District Unit');
      assert.strictEqual(created.code, testCode);
      assert.strictEqual(created.parentId, unitIdKA);
      assert.strictEqual(created.isActive, true);
    });

    it('Karnataka officer can create subordinate unit within Karnataka scope', async () => {
      const testCode = `TEST-TALUK-${ts}`;
      createdTestUnitCodes.push(testCode);

      const created = await administrativeUnitService.createAdministrativeUnit(
        {
          name: 'Test Taluk Unit',
          code: testCode,
          type: 'TALUK',
          parentId: unitIdKABLR,
          status: 'ACTIVE',
        },
        karnatakaAdminId
      );

      assert.ok(created);
      assert.strictEqual(created.code, testCode);
      assert.strictEqual(created.parentId, unitIdKABLR);
    });

    it('rejects creation if unit code already exists (409 Conflict)', async () => {
      await assert.rejects(
        async () => {
          await administrativeUnitService.createAdministrativeUnit(
            {
              name: 'Duplicate India',
              code: 'IND',
              type: 'CENTRAL',
              parentId: null,
            },
            superAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          assert.match((err as Error).message, /already exists/i);
          return true;
        }
      );
    });

    it('rejects creation if parent ID does not exist (400 Bad Request)', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await assert.rejects(
        async () => {
          await administrativeUnitService.createAdministrativeUnit(
            {
              name: 'Invalid Parent Unit',
              code: `INV-P-${ts}`,
              type: 'DISTRICT',
              parentId: nonExistentId,
            },
            superAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof BadRequestError);
          assert.match((err as Error).message, /does not exist/i);
          return true;
        }
      );
    });

    it('rejects creation if actor lacks ADMIN_UNIT_CREATE permission (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await administrativeUnitService.createAdministrativeUnit(
            {
              name: 'Unauthorized Unit',
              code: `UNAUTH-${ts}`,
              type: 'TALUK',
              parentId: unitIdKABLR,
            },
            fieldOfficerId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenError);
          return true;
        }
      );
    });

    it('rejects creation outside actor administrative scope (403 Forbidden)', async () => {
      // Karnataka officer attempting to create unit under Maharashtra (MH)
      await assert.rejects(
        async () => {
          await administrativeUnitService.createAdministrativeUnit(
            {
              name: 'Out of Scope Unit',
              code: `OOS-${ts}`,
              type: 'DISTRICT',
              parentId: unitIdMH,
            },
            karnatakaAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenError);
          return true;
        }
      );
    });
  });

  describe('Service: Unit Update & Circular Hierarchy Prevention', () => {
    let testUnitId: string;
    let testSubUnitId: string;

    before(async () => {
      const code1 = `U-A-${ts}`;
      const code2 = `U-B-${ts}`;
      createdTestUnitCodes.push(code1, code2);

      const u1 = await administrativeUnitRepository.createAdministrativeUnit({
        name: 'Unit A',
        code: code1,
        type: 'DISTRICT',
        parentId: unitIdKA,
        isActive: true,
      });
      testUnitId = u1.id;

      const u2 = await administrativeUnitRepository.createAdministrativeUnit({
        name: 'Unit B Subordinate to A',
        code: code2,
        type: 'TALUK',
        parentId: u1.id,
        isActive: true,
      });
      testSubUnitId = u2.id;
    });

    it('updates unit name and type successfully', async () => {
      const updated = await administrativeUnitService.updateAdministrativeUnit(
        testUnitId,
        {
          name: 'Unit A Updated',
          type: 'DISTRICT',
        },
        superAdminId
      );

      assert.ok(updated);
      assert.strictEqual(updated.name, 'Unit A Updated');
    });

    it('prevents an administrative unit from being its own parent (400 Bad Request)', async () => {
      await assert.rejects(
        async () => {
          await administrativeUnitService.updateAdministrativeUnit(
            testUnitId,
            {
              parentId: testUnitId,
            },
            superAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof BadRequestError);
          assert.match((err as Error).message, /cannot be its own parent/i);
          return true;
        }
      );
    });

    it('prevents circular hierarchy when setting parent to a descendant (409 Conflict)', async () => {
      // testSubUnitId is child of testUnitId. Setting testUnitId.parentId = testSubUnitId creates cycle:
      // testSubUnit -> testUnit -> testSubUnit
      await assert.rejects(
        async () => {
          await administrativeUnitService.updateAdministrativeUnit(
            testUnitId,
            {
              parentId: testSubUnitId,
            },
            superAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ConflictError);
          assert.match((err as Error).message, /circular hierarchy/i);
          return true;
        }
      );
    });

    it('rejects update if actor lacks ADMIN_UNIT_UPDATE permission (403 Forbidden)', async () => {
      await assert.rejects(
        async () => {
          await administrativeUnitService.updateAdministrativeUnit(
            testUnitId,
            { name: 'Unauthorized Change' },
            fieldOfficerId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenError);
          return true;
        }
      );
    });

    it('rejects update if target unit is outside actor scope (403 Forbidden)', async () => {
      // Karnataka officer attempting to update Maharashtra unit
      await assert.rejects(
        async () => {
          await administrativeUnitService.updateAdministrativeUnit(
            unitIdMH,
            { name: 'Illegal Edit' },
            karnatakaAdminId
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenError);
          return true;
        }
      );
    });
  });

  describe('Service: Hierarchy Tree Resolution', () => {
    it('getFullTree returns nested hierarchy for Super Admin', async () => {
      const tree = await administrativeUnitTreeService.getFullTree(superAdminId);
      assert.ok(tree.length >= 1);

      const central = tree.find((node) => node.code === 'IND');
      assert.ok(central);
      assert.ok(central.children.length >= 2);

      const karnataka = central.children.find((node) => node.code === 'KA');
      assert.ok(karnataka);
      assert.ok(karnataka.children.length >= 1);

      const blr = karnataka.children.find((node) => node.code === 'KA-BLR');
      assert.ok(blr);
    });

    it('getFullTree returns scoped tree rooted at assigned unit for scoped user', async () => {
      const tree = await administrativeUnitTreeService.getFullTree(karnatakaAdminId);
      assert.ok(tree.length >= 1);

      // Karnataka officer should see tree rooted at Karnataka (KA), not IND
      const karnatakaRoot = tree.find((node) => node.code === 'KA');
      assert.ok(karnatakaRoot);
      assert.ok(!tree.some((node) => node.code === 'MH'));
    });

    it('getUnitSubtree returns complete subtree rooted at given unit', async () => {
      const subtree = await administrativeUnitTreeService.getUnitSubtree(unitIdKA, superAdminId);
      assert.strictEqual(subtree.code, 'KA');
      assert.ok(subtree.children.length >= 1);
      assert.ok(subtree.children.some((c) => c.code === 'KA-BLR'));
    });
  });
});
