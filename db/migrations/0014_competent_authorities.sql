-- Migration: 0014_competent_authorities.sql
-- Step 3A: Competent Authority Foundation

-- 1. Create competent_authorities table
CREATE TABLE IF NOT EXISTS "competent_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority_code" varchar(50) NOT NULL,
	"authority_name" varchar(255) NOT NULL,
	"designation" varchar(255) NOT NULL,
	"authority_level" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competent_authorities_level_check" CHECK ("authority_level" IN ('DISTRICT', 'REGIONAL', 'STATE', 'CENTRAL')),
	CONSTRAINT "competent_authorities_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "competent_authorities_code_idx" ON "competent_authorities" ("authority_code");
CREATE INDEX IF NOT EXISTS "competent_authorities_level_idx" ON "competent_authorities" ("authority_level");
CREATE INDEX IF NOT EXISTS "competent_authorities_status_idx" ON "competent_authorities" ("status");

-- 2. Create authority_jurisdictions table
CREATE TABLE IF NOT EXISTS "authority_jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority_id" uuid NOT NULL,
	"state_id" uuid NOT NULL,
	"district_id" uuid,
	"taluk_id" uuid,
	"village_id" uuid,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authority_jurisdictions_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS "authority_jurisdictions_authority_id_idx" ON "authority_jurisdictions" ("authority_id");
CREATE INDEX IF NOT EXISTS "authority_jurisdictions_state_id_idx" ON "authority_jurisdictions" ("state_id");
CREATE INDEX IF NOT EXISTS "authority_jurisdictions_district_id_idx" ON "authority_jurisdictions" ("district_id");
CREATE INDEX IF NOT EXISTS "authority_jurisdictions_taluk_id_idx" ON "authority_jurisdictions" ("taluk_id");
CREATE INDEX IF NOT EXISTS "authority_jurisdictions_status_idx" ON "authority_jurisdictions" ("status");

-- 3. Create authority_user_assignments table
CREATE TABLE IF NOT EXISTS "authority_user_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authority_user_assignments_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS "authority_user_assignments_authority_id_idx" ON "authority_user_assignments" ("authority_id");
CREATE INDEX IF NOT EXISTS "authority_user_assignments_user_id_idx" ON "authority_user_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "authority_user_assignments_status_idx" ON "authority_user_assignments" ("status");

-- 4. Create proposal_authority_assignments table
CREATE TABLE IF NOT EXISTS "proposal_authority_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"proposal_version_id" uuid NOT NULL,
	"authority_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignment_status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_auth_assign_status_check" CHECK ("assignment_status" IN ('ACTIVE', 'SUPERSEDED'))
);

CREATE INDEX IF NOT EXISTS "proposal_auth_assign_proposal_id_idx" ON "proposal_authority_assignments" ("proposal_id");
CREATE INDEX IF NOT EXISTS "proposal_auth_assign_version_id_idx" ON "proposal_authority_assignments" ("proposal_version_id");
CREATE INDEX IF NOT EXISTS "proposal_auth_assign_authority_id_idx" ON "proposal_authority_assignments" ("authority_id");
CREATE INDEX IF NOT EXISTS "proposal_auth_assign_status_idx" ON "proposal_authority_assignments" ("assignment_status");

-- 5. Add selected_authority_id to acquisition_proposal_versions
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "selected_authority_id" uuid;
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_sel_auth_idx" ON "acquisition_proposal_versions" ("selected_authority_id");

-- Foreign key constraints
DO $$ BEGIN
  ALTER TABLE "authority_jurisdictions" ADD CONSTRAINT "authority_jurisdictions_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."competent_authorities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_jurisdictions" ADD CONSTRAINT "authority_jurisdictions_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_jurisdictions" ADD CONSTRAINT "authority_jurisdictions_district_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_jurisdictions" ADD CONSTRAINT "authority_jurisdictions_taluk_id_fk" FOREIGN KEY ("taluk_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_jurisdictions" ADD CONSTRAINT "authority_jurisdictions_village_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_user_assignments" ADD CONSTRAINT "authority_user_assignments_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."competent_authorities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_user_assignments" ADD CONSTRAINT "authority_user_assignments_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "authority_user_assignments" ADD CONSTRAINT "authority_user_assignments_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "proposal_authority_assignments" ADD CONSTRAINT "proposal_authority_assignments_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."acquisition_proposals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "proposal_authority_assignments" ADD CONSTRAINT "proposal_authority_assignments_proposal_version_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."acquisition_proposal_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "proposal_authority_assignments" ADD CONSTRAINT "proposal_authority_assignments_authority_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."competent_authorities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "proposal_authority_assignments" ADD CONSTRAINT "proposal_authority_assignments_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


