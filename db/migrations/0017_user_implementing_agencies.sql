-- Migration: 0017_user_implementing_agencies.sql
-- Associates Project Officers with Implementing Agencies while preserving historical records.

CREATE TABLE IF NOT EXISTS "user_implementing_agency_assignments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "implementing_agency_id" uuid NOT NULL REFERENCES "implementing_agencies"("id") ON DELETE RESTRICT,
    "assigned_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "effective_from" date NOT NULL,
    "effective_until" date,
    "status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_impl_agency_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS "user_impl_agency_user_id_idx"
    ON "user_implementing_agency_assignments" ("user_id");

CREATE INDEX IF NOT EXISTS "user_impl_agency_agency_id_idx"
    ON "user_implementing_agency_assignments" ("implementing_agency_id");

CREATE INDEX IF NOT EXISTS "user_impl_agency_status_idx"
    ON "user_implementing_agency_assignments" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "user_impl_agency_active_user_idx"
    ON "user_implementing_agency_assignments" ("user_id")
    WHERE "status" = 'ACTIVE';
