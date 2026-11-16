-- Migration: 0015_competent_authority_role.sql
-- Step 3B Extension: Add COMPETENT_AUTHORITY Role to Existing Role System

-- 1. Insert COMPETENT_AUTHORITY into roles table
INSERT INTO "roles" ("id", "name", "description", "is_system_role", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    'COMPETENT_AUTHORITY',
    'Competent Authority designated for acquisition proposal scrutiny and decisions',
    true,
    now(),
    now()
)
ON CONFLICT ("name") DO NOTHING;

-- 2. Grant baseline permissions to COMPETENT_AUTHORITY
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'COMPETENT_AUTHORITY'
  AND p.name IN ('ACQUISITION_CASE_VIEW', 'PROJECT_VIEW', 'ADMIN_UNIT_VIEW')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
