-- Migration: 0012_acquisition_proposals.sql
-- Land Acquisition Proposal Management: Foundation & Preparation (Step 1)

CREATE SEQUENCE IF NOT EXISTS "acquisition_proposal_ref_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS "acquisition_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_number" varchar(50) NOT NULL,
	"acquisition_case_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"implementing_agency_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"linked_inventory_id" uuid NOT NULL,
	"linked_inventory_version_id" uuid NOT NULL,
	"current_version_id" uuid,
	"current_version_number" integer DEFAULT 1 NOT NULL,
	"current_status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_proposals_status_check" CHECK ("current_status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
	CONSTRAINT "acquisition_proposals_version_num_check" CHECK ("current_version_number" >= 1)
);

CREATE TABLE IF NOT EXISTS "acquisition_proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"acquisition_justification" text NOT NULL,
	"public_purpose" text NOT NULL,
	"legal_framework" varchar(255) NOT NULL,
	"land_requirement_explanation" text NOT NULL,
	"administrative_approval_ref" varchar(255),
	"administrative_approval_date" timestamp with time zone,
	"additional_details" jsonb,
	"supporting_documents" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_proposal_versions_num_check" CHECK ("version_number" >= 1),
	CONSTRAINT "acquisition_proposal_versions_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE TABLE IF NOT EXISTS "acquisition_proposal_workflow_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"actor_id" uuid NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acq_prop_wf_history_action_check" CHECK ("action" IN ('CREATE_DRAFT', 'UPDATE_DRAFT'))
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_acquisition_case_id_acquisition_cases_id_fk" FOREIGN KEY ("acquisition_case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_implementing_agency_id_implementing_agencies_id_fk" FOREIGN KEY ("implementing_agency_id") REFERENCES "public"."implementing_agencies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_linked_inventory_id_verified_land_inventories_id_fk" FOREIGN KEY ("linked_inventory_id") REFERENCES "public"."verified_land_inventories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_linked_inventory_version_id_verified_land_inventories_id_fk" FOREIGN KEY ("linked_inventory_version_id") REFERENCES "public"."verified_land_inventories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_current_version_id_acquisition_proposal_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."acquisition_proposal_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposal_versions" ADD CONSTRAINT "acquisition_proposal_versions_proposal_id_acquisition_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."acquisition_proposals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposal_versions" ADD CONSTRAINT "acquisition_proposal_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposal_workflow_history" ADD CONSTRAINT "acquisition_proposal_workflow_history_proposal_id_acquisition_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."acquisition_proposals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "acquisition_proposal_workflow_history" ADD CONSTRAINT "acquisition_proposal_workflow_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "acquisition_proposals_case_id_idx" ON "acquisition_proposals" USING btree ("acquisition_case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "acquisition_proposals_number_idx" ON "acquisition_proposals" USING btree ("proposal_number");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_project_id_idx" ON "acquisition_proposals" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_agency_id_idx" ON "acquisition_proposals" USING btree ("implementing_agency_id");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_created_by_idx" ON "acquisition_proposals" USING btree ("created_by");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_linked_inv_id_idx" ON "acquisition_proposals" USING btree ("linked_inventory_id");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_linked_inv_ver_idx" ON "acquisition_proposals" USING btree ("linked_inventory_version_id");
CREATE INDEX IF NOT EXISTS "acquisition_proposals_status_idx" ON "acquisition_proposals" USING btree ("current_status");

CREATE UNIQUE INDEX IF NOT EXISTS "acquisition_proposal_versions_proposal_ver_idx" ON "acquisition_proposal_versions" USING btree ("proposal_id","version_number");
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_proposal_id_idx" ON "acquisition_proposal_versions" USING btree ("proposal_id");
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_created_by_idx" ON "acquisition_proposal_versions" USING btree ("created_by");

CREATE INDEX IF NOT EXISTS "acq_prop_wf_history_proposal_id_idx" ON "acquisition_proposal_workflow_history" USING btree ("proposal_id");
CREATE INDEX IF NOT EXISTS "acq_prop_wf_history_actor_id_idx" ON "acquisition_proposal_workflow_history" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "acq_prop_wf_history_created_at_idx" ON "acquisition_proposal_workflow_history" USING btree ("created_at");

