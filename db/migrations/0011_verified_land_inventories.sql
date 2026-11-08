-- Migration: 0011_verified_land_inventories.sql
-- Verified Land Inventory Backend Foundation

-- 1. Create verified_land_inventories table
CREATE TABLE IF NOT EXISTS "verified_land_inventories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
  "total_parcel_count" integer DEFAULT 0 NOT NULL,
  "aggregate_recorded_area" numeric(18, 4) DEFAULT '0' NOT NULL,
  "aggregate_affected_area" numeric(18, 4) DEFAULT '0' NOT NULL,
  "area_unit" varchar(50) DEFAULT 'SQ_M' NOT NULL,
  "prepared_by" uuid NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_by" uuid,
  "submitted_at" timestamp with time zone,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_remarks" text,
  "previous_version_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_prepared_by_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_submitted_by_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_previous_version_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."verified_land_inventories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "verified_land_inventories" DROP CONSTRAINT IF EXISTS "verified_land_inventories_status_check";
--> statement-breakpoint
ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_status_check" CHECK ("status" IN (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'REJECTED'
));
--> statement-breakpoint

ALTER TABLE "verified_land_inventories" DROP CONSTRAINT IF EXISTS "verified_land_inventories_version_number_check";
--> statement-breakpoint
ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_version_number_check" CHECK ("version_number" >= 1);
--> statement-breakpoint

ALTER TABLE "verified_land_inventories" DROP CONSTRAINT IF EXISTS "verified_land_inventories_total_parcel_count_check";
--> statement-breakpoint
ALTER TABLE "verified_land_inventories" ADD CONSTRAINT "verified_land_inventories_total_parcel_count_check" CHECK ("total_parcel_count" >= 0);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "verified_land_inventories_case_version_idx" ON "verified_land_inventories" ("case_id", "version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_case_id_idx" ON "verified_land_inventories" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_status_idx" ON "verified_land_inventories" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_prepared_by_idx" ON "verified_land_inventories" ("prepared_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_submitted_by_idx" ON "verified_land_inventories" ("submitted_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_reviewed_by_idx" ON "verified_land_inventories" ("reviewed_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_land_inventories_prev_version_idx" ON "verified_land_inventories" ("previous_version_id");
--> statement-breakpoint

-- 2. Create inventory_parcel_snapshots table
CREATE TABLE IF NOT EXISTS "inventory_parcel_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inventory_id" uuid NOT NULL,
  "parcel_id" uuid NOT NULL,
  "case_parcel_id" uuid NOT NULL,
  "state" varchar(100) NOT NULL,
  "district" varchar(100) NOT NULL,
  "taluk" varchar(100) NOT NULL,
  "village" varchar(100) NOT NULL,
  "survey_number" varchar(100) NOT NULL,
  "hissa_number" varchar(100),
  "land_record_reference" varchar(255),
  "recorded_area" numeric(18, 4) NOT NULL,
  "recorded_area_unit" varchar(50) NOT NULL,
  "proposed_affected_area" numeric(18, 4) NOT NULL,
  "proposed_affected_area_unit" varchar(50) NOT NULL,
  "field_measured_area" numeric(18, 4),
  "field_measured_area_unit" varchar(50),
  "accepted_report_id" uuid,
  "verification_date" timestamp with time zone,
  "reviewing_officer_id" uuid,
  "geometry" geometry(Geometry, 4326),
  "discrepancy_details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."verified_land_inventories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_parcel_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."land_parcels"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_case_parcel_id_fk" FOREIGN KEY ("case_parcel_id") REFERENCES "public"."acquisition_case_parcels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_accepted_report_id_fk" FOREIGN KEY ("accepted_report_id") REFERENCES "public"."field_verification_reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_reviewing_officer_id_fk" FOREIGN KEY ("reviewing_officer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "inventory_parcel_snapshots" DROP CONSTRAINT IF EXISTS "inventory_parcel_snapshots_recorded_area_check";
--> statement-breakpoint
ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_recorded_area_check" CHECK ("recorded_area" > 0);
--> statement-breakpoint

ALTER TABLE "inventory_parcel_snapshots" DROP CONSTRAINT IF EXISTS "inventory_parcel_snapshots_proposed_area_check";
--> statement-breakpoint
ALTER TABLE "inventory_parcel_snapshots" ADD CONSTRAINT "inventory_parcel_snapshots_proposed_area_check" CHECK ("proposed_affected_area" > 0);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_parcel_snapshots_inv_case_parcel_idx" ON "inventory_parcel_snapshots" ("inventory_id", "case_parcel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_parcel_snapshots_inventory_id_idx" ON "inventory_parcel_snapshots" ("inventory_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_parcel_snapshots_parcel_id_idx" ON "inventory_parcel_snapshots" ("parcel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_parcel_snapshots_case_parcel_id_idx" ON "inventory_parcel_snapshots" ("case_parcel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_parcel_snapshots_accepted_report_id_idx" ON "inventory_parcel_snapshots" ("accepted_report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_parcel_snapshots_reviewing_officer_id_idx" ON "inventory_parcel_snapshots" ("reviewing_officer_id");
--> statement-breakpoint

-- 3. Create verified_land_inventory_workflow_history table
CREATE TABLE IF NOT EXISTS "verified_land_inventory_workflow_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inventory_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "action" varchar(50) NOT NULL,
  "from_status" varchar(50),
  "to_status" varchar(50) NOT NULL,
  "actor_id" uuid NOT NULL,
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventory_workflow_history" ADD CONSTRAINT "inventory_wf_history_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."verified_land_inventories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventory_workflow_history" ADD CONSTRAINT "inventory_wf_history_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "verified_land_inventory_workflow_history" ADD CONSTRAINT "inventory_wf_history_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "verified_land_inventory_workflow_history" DROP CONSTRAINT IF EXISTS "inventory_wf_history_action_check";
--> statement-breakpoint
ALTER TABLE "verified_land_inventory_workflow_history" ADD CONSTRAINT "inventory_wf_history_action_check" CHECK ("action" IN (
  'GENERATE',
  'REGENERATE',
  'SUBMIT',
  'START_REVIEW',
  'APPROVE',
  'REQUEST_CORRECTIONS',
  'REJECT'
));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inventory_wf_history_inventory_id_idx" ON "verified_land_inventory_workflow_history" ("inventory_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_wf_history_case_id_idx" ON "verified_land_inventory_workflow_history" ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_wf_history_actor_id_idx" ON "verified_land_inventory_workflow_history" ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_wf_history_created_at_idx" ON "verified_land_inventory_workflow_history" ("created_at");
