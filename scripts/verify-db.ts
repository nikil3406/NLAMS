/**
 * NLAMS Database Verification Script
 * Phase 1 — Step 2
 *
 * Checks:
 *   ✓ Database connection
 *   ✓ PostgreSQL version
 *   ✓ PostGIS availability
 *   ✓ Seven tables exist
 *   ✓ Foreign keys exist
 *   ✓ Seed roles exist
 *   ✓ Seed permissions exist
 *   ✓ Administrative hierarchy exists
 *   ✓ Super Admin exists
 *
 * Run with: pnpm db:verify
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';

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
  } catch { /* ignore */ }
}
loadEnvLocal();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const client = postgres(DATABASE_URL, { max: 1 });

let passed = 0;
let failed = 0;

function ok(label: string, info = '') {
  passed++;
  console.log(`  ✓ ${label}${info ? `  [${info}]` : ''}`);
}
function fail(label: string, info = '') {
  failed++;
  console.log(`  ✗ ${label}${info ? `  [${info}]` : ''}`);
}

async function verify() {
  console.log('\n🔍 NLAMS Database Verification\n');

  // 1. Connection
  try {
    await client`SELECT 1`;
    ok('Database connection');
  } catch (e) {
    fail('Database connection', String(e));
    console.error('\n❌ Cannot connect — aborting.');
    await client.end();
    process.exit(1);
  }

  // 2. PostgreSQL version
  const [verRow] = await client`SELECT version()`;
  ok('PostgreSQL version', verRow.version.split(',')[0]);

  // 3. PostGIS
  const postgisRows = await client`
    SELECT extversion FROM pg_extension WHERE extname = 'postgis'
  `;
  if (postgisRows.length > 0) {
    ok('PostGIS available', `v${postgisRows[0].extversion}`);
  } else {
    fail('PostGIS available', 'extension not found');
  }

  // 4. Required tables
  const REQUIRED_TABLES = [
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'administrative_units',
    'user_assignments',
    'sessions',
    'implementing_agencies',
    'projects',
    'project_boundary_versions',
    'acquisition_cases',
    'acquisition_case_workflow_history',
    'land_parcels',
    'acquisition_case_parcels',
    'field_verification_reports',
  ];

  console.log('\n  Tables:');
  const tableRows = await client`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = ANY(${REQUIRED_TABLES})
  `;
  const foundTables = new Set(tableRows.map((r) => r.tablename));
  for (const t of REQUIRED_TABLES) {
    if (foundTables.has(t)) ok(`  Table: ${t}`);
    else fail(`  Table: ${t}`, 'MISSING');
  }

  // 5. Foreign keys
  console.log('\n  Foreign keys:');
  const fkRows = await client`
    SELECT conname FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid::regclass::text IN (
        'role_permissions','user_roles','user_assignments','administrative_units','sessions'
      )
    ORDER BY conname
  `;
  if (fkRows.length >= 8) {
    ok(`Foreign keys exist (${fkRows.length} found)`);
  } else {
    fail(`Foreign keys`, `expected ≥8, found ${fkRows.length}`);
  }

  // 6. Seed roles
  console.log('\n  Seed roles:');
  const EXPECTED_ROLES = ['SUPER_ADMIN','MINISTRY_ADMIN','PROJECT_OFFICER','LAND_OFFICER','FIELD_OFFICER'];
  const roleRows = await client`SELECT name FROM roles WHERE name = ANY(${EXPECTED_ROLES})`;
  const foundRoles = new Set(roleRows.map((r) => r.name));
  for (const r of EXPECTED_ROLES) {
    if (foundRoles.has(r)) ok(`  Role: ${r}`);
    else fail(`  Role: ${r}`, 'MISSING');
  }

  // 7. Seed permissions
  console.log('\n  Seed permissions:');
  const EXPECTED_PERMS = [
    'USER_VIEW','USER_CREATE','USER_UPDATE','USER_ASSIGN',
    'ROLE_VIEW','ROLE_ASSIGN',
    'ADMIN_UNIT_VIEW','ADMIN_UNIT_CREATE','ADMIN_UNIT_UPDATE',
  ];
  const permRows = await client`SELECT name FROM permissions WHERE name = ANY(${EXPECTED_PERMS})`;
  const foundPerms = new Set(permRows.map((r) => r.name));
  for (const p of EXPECTED_PERMS) {
    if (foundPerms.has(p)) ok(`  Permission: ${p}`);
    else fail(`  Permission: ${p}`, 'MISSING');
  }

  // 8. Administrative hierarchy
  console.log('\n  Administrative hierarchy:');
  const unitRows = await client`
    SELECT code, name, parent_id FROM administrative_units
    WHERE code IN ('IND','KA','KA-BLR')
    ORDER BY code
  `;
  for (const u of unitRows) {
    ok(`  Admin unit: ${u.name} (${u.code})`);
  }
  if (unitRows.length < 3) fail('Hierarchy incomplete', `expected 3, found ${unitRows.length}`);

  // 9. Super Admin
  console.log('\n  Super Admin:');
  const adminRows = await client`
    SELECT u.email, r.name AS role
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = 'SUPER_ADMIN'
    LIMIT 1
  `;
  if (adminRows.length > 0) {
    ok(`Super Admin exists: ${adminRows[0].email}`);
  } else {
    fail('Super Admin', 'not found or SUPER_ADMIN role not assigned');
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Passed: ${passed}   Failed: ${failed}`);
  if (failed === 0) {
    console.log('\n✅ All checks passed. Database foundation is ready.\n');
  } else {
    console.log(`\n⚠️  ${failed} check(s) failed. Review output above.\n`);
  }
}

verify()
  .catch((err) => {
    console.error('\n❌ Verification error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
