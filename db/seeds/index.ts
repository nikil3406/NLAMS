/**
 * NLAMS Database Seed Script
 * Phase 1 — Step 2: Database Foundation
 *
 * Seeds initial system data:
 *   - System roles
 *   - Phase 1 permissions
 *   - Role-permission assignments
 *   - Development administrative hierarchy
 *   - Super Admin user (credentials from environment)
 *
 * Run with: pnpm db:seed
 * Requires: .env.local with DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *
 * NOTE: Development administrative hierarchy is placeholder data only.
 * Real government administrative data will be loaded/configured in a later phase.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { hash } from '@node-rs/argon2';
import * as schema from '../schema/index.js';
import { seedImplementingAgencies } from './implementing-agencies.js';

// ----------------------------------------------------------------
// Load .env.local manually (tsx does not auto-load it)
// ----------------------------------------------------------------
function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // env vars may already be set from the shell
  }
}
loadEnvLocal();

const DATABASE_URL = process.env.DATABASE_URL;
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!SEED_ADMIN_EMAIL) throw new Error('SEED_ADMIN_EMAIL is required');
if (!SEED_ADMIN_PASSWORD) throw new Error('SEED_ADMIN_PASSWORD is required');

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

// ----------------------------------------------------------------
// Seed data definitions
// ----------------------------------------------------------------

const ROLES = [
  { name: 'SUPER_ADMIN',     description: 'Full system access — all permissions', isSystemRole: true },
  { name: 'MINISTRY_ADMIN',  description: 'Ministry-level administration', isSystemRole: true },
  { name: 'PROJECT_OFFICER', description: 'Project management and oversight', isSystemRole: true },
  { name: 'LAND_OFFICER',    description: 'Land record and assessment management', isSystemRole: true },
  { name: 'FIELD_OFFICER',   description: 'Field operations and data collection', isSystemRole: true },
] as const;

const PERMISSIONS = [
  { name: 'USER_VIEW',         description: 'View user profiles and lists' },
  { name: 'USER_CREATE',       description: 'Create new user accounts' },
  { name: 'USER_UPDATE',       description: 'Update existing user information' },
  { name: 'USER_ASSIGN',       description: 'Assign users to roles and administrative units' },
  { name: 'ROLE_VIEW',         description: 'View role definitions and memberships' },
  { name: 'ROLE_ASSIGN',       description: 'Assign roles to users' },
  { name: 'ADMIN_UNIT_VIEW',   description: 'View administrative unit details' },
  { name: 'ADMIN_UNIT_CREATE', description: 'Create new administrative units' },
  { name: 'ADMIN_UNIT_UPDATE', description: 'Update administrative unit information' },
  { name: 'PROJECT_VIEW',      description: 'View projects and details' },
  { name: 'PROJECT_CREATE',    description: 'Create new infrastructure projects' },
  { name: 'PROJECT_UPDATE',    description: 'Update existing project details' },
  { name: 'PROJECT_REGISTER',  description: 'Formally register draft projects' },
  { name: 'ACQUISITION_CASE_VIEW',   description: 'View acquisition cases and details' },
  { name: 'ACQUISITION_CASE_CREATE', description: 'Create draft acquisition cases' },
  { name: 'ACQUISITION_CASE_UPDATE', description: 'Update draft or returned acquisition cases' },
  { name: 'ACQUISITION_CASE_SUBMIT', description: 'Submit acquisition cases for review' },
] as const;

type PermissionName = typeof PERMISSIONS[number]['name'];

const ROLE_PERMISSIONS: Record<string, PermissionName[]> = {
  SUPER_ADMIN: [
    'USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_ASSIGN',
    'ROLE_VIEW', 'ROLE_ASSIGN',
    'ADMIN_UNIT_VIEW', 'ADMIN_UNIT_CREATE', 'ADMIN_UNIT_UPDATE',
    'PROJECT_VIEW', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_REGISTER',
    'ACQUISITION_CASE_VIEW', 'ACQUISITION_CASE_CREATE', 'ACQUISITION_CASE_UPDATE', 'ACQUISITION_CASE_SUBMIT',
  ],
  MINISTRY_ADMIN: [
    'USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_ASSIGN',
    'ROLE_VIEW', 'ROLE_ASSIGN',
    'ADMIN_UNIT_VIEW', 'ADMIN_UNIT_CREATE', 'ADMIN_UNIT_UPDATE',
    'PROJECT_VIEW', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_REGISTER',
    'ACQUISITION_CASE_VIEW', 'ACQUISITION_CASE_CREATE', 'ACQUISITION_CASE_UPDATE', 'ACQUISITION_CASE_SUBMIT',
  ],
  PROJECT_OFFICER: [
    'USER_VIEW', 'ROLE_VIEW', 'ADMIN_UNIT_VIEW',
    'PROJECT_VIEW', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_REGISTER',
    'ACQUISITION_CASE_VIEW',
  ],
  LAND_OFFICER: [
    'USER_VIEW', 'ROLE_VIEW', 'ADMIN_UNIT_VIEW', 'PROJECT_VIEW',
    'ACQUISITION_CASE_VIEW', 'ACQUISITION_CASE_CREATE', 'ACQUISITION_CASE_UPDATE', 'ACQUISITION_CASE_SUBMIT',
  ],
  FIELD_OFFICER: [
    'USER_VIEW', 'ADMIN_UNIT_VIEW', 'PROJECT_VIEW',
    'ACQUISITION_CASE_VIEW',
  ],
};

// Development-only administrative hierarchy
// Real government data will be configured in a later phase.
const ADMIN_UNITS: { name: string; code: string; type: string; parentCode: string | null }[] = [
  { name: 'Central Government', code: 'IND',      type: 'CENTRAL',  parentCode: null   },
  { name: 'Karnataka',          code: 'KA',       type: 'STATE',    parentCode: 'IND'  },
  { name: 'Bengaluru Urban',    code: 'KA-BLR',   type: 'DISTRICT', parentCode: 'KA'   },
  { name: 'Bengaluru North',    code: 'KA-BLR-N', type: 'TALUK',    parentCode: 'KA-BLR' },
  { name: 'Mysuru',             code: 'KA-MYS',   type: 'DISTRICT', parentCode: 'KA'   },
  { name: 'Maharashtra',        code: 'MH',       type: 'STATE',    parentCode: 'IND'  },
];

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
async function fetchId(table: string, field: string, value: string): Promise<string | null> {
  const rows = await client`SELECT id FROM ${client(table)} WHERE ${client(field)} = ${value} LIMIT 1`;
  return rows[0]?.id ?? null;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------
async function seed() {
  console.log('🌱 Starting NLAMS seed...\n');

  // 1. Roles
  console.log('📌 Seeding roles...');
  const roleIds: Record<string, string> = {};
  for (const role of ROLES) {
    const [inserted] = await db
      .insert(schema.roles)
      .values({ name: role.name, description: role.description, isSystemRole: role.isSystemRole })
      .onConflictDoNothing()
      .returning({ id: schema.roles.id, name: schema.roles.name });

    if (inserted) {
      roleIds[inserted.name] = inserted.id;
      console.log(`  ✓ Role created: ${inserted.name}`);
    } else {
      const id = await fetchId('roles', 'name', role.name);
      if (id) { roleIds[role.name] = id; console.log(`  ℹ Role exists:   ${role.name}`); }
    }
  }

  // 2. Permissions
  console.log('\n📌 Seeding permissions...');
  const permIds: Record<string, string> = {};
  for (const perm of PERMISSIONS) {
    const [inserted] = await db
      .insert(schema.permissions)
      .values({ name: perm.name, description: perm.description })
      .onConflictDoNothing()
      .returning({ id: schema.permissions.id, name: schema.permissions.name });

    if (inserted) {
      permIds[inserted.name] = inserted.id;
      console.log(`  ✓ Permission created: ${inserted.name}`);
    } else {
      const id = await fetchId('permissions', 'name', perm.name);
      if (id) { permIds[perm.name] = id; console.log(`  ℹ Permission exists:   ${perm.name}`); }
    }
  }

  // 3. Role-permission assignments
  console.log('\n📌 Seeding role-permission assignments...');
  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds[roleName];
    if (!roleId) { console.log(`  ⚠ Skipping ${roleName} — role id not found`); continue; }
    for (const permName of permNames) {
      const permissionId = permIds[permName];
      if (!permissionId) continue;
      await db
        .insert(schema.rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing();
    }
    console.log(`  ✓ ${roleName} → [${permNames.join(', ')}]`);
  }

  // 4. Administrative hierarchy
  console.log('\n📌 Seeding administrative units (dev hierarchy)...');
  const unitIds: Record<string, string> = {};
  for (const unit of ADMIN_UNITS) {
    const parentId = unit.parentCode ? (unitIds[unit.parentCode] ?? null) : null;
    const [inserted] = await db
      .insert(schema.administrativeUnits)
      .values({ name: unit.name, code: unit.code, type: unit.type, parentId, isActive: true })
      .onConflictDoNothing()
      .returning({ id: schema.administrativeUnits.id, code: schema.administrativeUnits.code });

    if (inserted) {
      unitIds[inserted.code] = inserted.id;
      console.log(`  ✓ Admin unit created: ${unit.name} (${unit.code})`);
    } else {
      const id = await fetchId('administrative_units', 'code', unit.code);
      if (id) { unitIds[unit.code] = id; console.log(`  ℹ Admin unit exists: ${unit.name}`); }
    }
  }

  // 5. Super Admin user
  console.log('\n📌 Seeding Super Admin...');
  const existingAdmin = await client`SELECT id FROM users WHERE email = ${SEED_ADMIN_EMAIL as string} LIMIT 1`;

  let superAdminId: string;
  if (existingAdmin.length > 0) {
    superAdminId = existingAdmin[0].id;
    console.log(`  ℹ Super Admin already exists: ${SEED_ADMIN_EMAIL}`);
  } else {
    // Hash password using Argon2id (OWASP recommended settings)
    const passwordHash = await hash(SEED_ADMIN_PASSWORD!, {
      algorithm: 2,       // Argon2id
      memoryCost: 65536,  // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });

    const [superAdmin] = await db
      .insert(schema.users)
      .values({
        name: 'System Administrator',
        email: SEED_ADMIN_EMAIL!,
        passwordHash,
        status: 'ACTIVE',
      })
      .returning({ id: schema.users.id });

    superAdminId = superAdmin.id;
    console.log(`  ✓ Super Admin created: ${SEED_ADMIN_EMAIL}`);
  }

  // Assign SUPER_ADMIN role (self-referential assignedBy for bootstrap)
  const superAdminRoleId = roleIds['SUPER_ADMIN'];
  if (superAdminId && superAdminRoleId) {
    await db
      .insert(schema.userRoles)
      .values({ userId: superAdminId, roleId: superAdminRoleId, assignedBy: superAdminId })
      .onConflictDoNothing();
    console.log('  ✓ SUPER_ADMIN role assigned');
  }

  // 6. Implementing Agencies Catalogue
  console.log('\n📌 Seeding implementing agencies catalogue...');
  const agencyStats = await seedImplementingAgencies(db);
  console.log(
    `  Summary: ${agencyStats.inserted} inserted, ${agencyStats.updated} updated, ${agencyStats.unchanged} unchanged, ${agencyStats.skipped} skipped.`
  );

  console.log('\n✅ Seed completed successfully.\n');
}

seed()
  .catch(async (err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
