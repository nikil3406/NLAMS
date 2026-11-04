-- Migration: 0009_discrepancy_investigation_resolution.sql
-- Step 6: Discrepancy Investigation and Resolution Workflow

-- 1. Create parcel_discrepancies table
CREATE TABLE IF NOT EXISTS "parcel_discrepancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "case_parcel_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "review_id" uuid,
  "category" varchar(50) DEFAULT 'OTHER' NOT NULL,
  "description" text NOT NULL,
  "status" varchar(50) DEFAULT 'OPEN' NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_case_parcel_id_fk" FOREIGN KEY ("case_parcel_id") REFERENCES "public"."acquisition_case_parcels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."field_verification_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."field_verification_report_reviews"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "parcel_discrepancies" DROP CONSTRAINT IF EXISTS "parcel_discrepancies_category_check";
--> statement-breakpoint
ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_category_check" CHECK ("category" IN (
  'SURVEY_IDENTITY_MISMATCH',
  'AREA_MISMATCH',
  'BOUNDARY_MISMATCH',
  'LAND_USE_MISMATCH',
  'LAND_RECORD_MISMATCH',
  'OWNERSHIP_RECORD_CONFLICT',
  'OTHER'
));
--> statement-breakpoint

ALTER TABLE "parcel_discrepancies" DROP CONSTRAINT IF EXISTS "parcel_discrepancies_status_check";
--> statement-breakpoint
ALTER TABLE "parcel_discrepancies" ADD CONSTRAINT "parcel_discrepancies_status_check" CHECK ("status" IN (
  'OPEN',
  'UNDER_INVESTIGATION',
  'SUBMITTED_FOR_RESOLUTION',
  'RESOLVED'
));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "parcel_discrepancies_case_id_idx" ON "parcel_discrepancies" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcel_discrepancies_case_parcel_id_idx" ON "parcel_discrepancies" USING btree ("case_parcel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcel_discrepancies_report_id_idx" ON "parcel_discrepancies" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcel_discrepancies_status_idx" ON "parcel_discrepancies" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcel_discrepancies_category_idx" ON "parcel_discrepancies" USING btree ("category");
--> statement-breakpoint

-- Prevent duplicate active (unresolved) discrepancy records for the same triggering report
CREATE UNIQUE INDEX IF NOT EXISTS "parcel_discrepancies_active_report_idx" ON "parcel_discrepancies" ("report_id") WHERE ("status" != 'RESOLVED');
--> statement-breakpoint

-- 2. Create discrepancy_investigations table
CREATE TABLE IF NOT EXISTS "discrepancy_investigations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discrepancy_id" uuid NOT NULL,
  "investigator_id" uuid NOT NULL,
  "findings" text,
  "notes" text,
  "status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_investigations" ADD CONSTRAINT "discrepancy_investigations_discrepancy_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."parcel_discrepancies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_investigations" ADD CONSTRAINT "discrepancy_investigations_investigator_id_fk" FOREIGN KEY ("investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_investigations" ADD CONSTRAINT "discrepancy_investigations_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "discrepancy_investigations" DROP CONSTRAINT IF EXISTS "discrepancy_investigations_status_check";
--> statement-breakpoint
ALTER TABLE "discrepancy_investigations" ADD CONSTRAINT "discrepancy_investigations_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "discrepancy_investigations_discrepancy_id_idx" ON "discrepancy_investigations" USING btree ("discrepancy_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discrepancy_investigations_investigator_id_idx" ON "discrepancy_investigations" USING btree ("investigator_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discrepancy_investigations_status_idx" ON "discrepancy_investigations" USING btree ("status");
--> statement-breakpoint

-- 3. Create discrepancy_resolution_history table
CREATE TABLE IF NOT EXISTS "discrepancy_resolution_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discrepancy_id" uuid NOT NULL,
  "investigation_id" uuid,
  "decision" varchar(50) NOT NULL,
  "remarks" text NOT NULL,
  "resolved_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_resolution_history" ADD CONSTRAINT "discrepancy_resolution_history_discrepancy_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."parcel_discrepancies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_resolution_history" ADD CONSTRAINT "discrepancy_resolution_history_investigation_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."discrepancy_investigations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discrepancy_resolution_history" ADD CONSTRAINT "discrepancy_resolution_history_resolved_by_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "discrepancy_resolution_history" DROP CONSTRAINT IF EXISTS "discrepancy_resolution_decision_check";
--> statement-breakpoint
ALTER TABLE "discrepancy_resolution_history" ADD CONSTRAINT "discrepancy_resolution_decision_check" CHECK ("decision" IN ('RESOLVED', 'RETURNED_FOR_FURTHER_INVESTIGATION'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "discrepancy_resolution_history_discrepancy_id_idx" ON "discrepancy_resolution_history" USING btree ("discrepancy_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discrepancy_resolution_history_investigation_id_idx" ON "discrepancy_resolution_history" USING btree ("investigation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discrepancy_resolution_history_resolved_by_idx" ON "discrepancy_resolution_history" USING btree ("resolved_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discrepancy_resolution_history_created_at_idx" ON "discrepancy_resolution_history" USING btree ("created_at");
--> statement-breakpoint

-- 4. Extend field_verification_evidence to support investigation-level evidence
ALTER TABLE "field_verification_evidence" ALTER COLUMN "report_id" DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_evidence" ADD COLUMN IF NOT EXISTS "investigation_id" uuid REFERENCES "public"."discrepancy_investigations"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "field_verif_evidence_investigation_id_idx" ON "field_verification_evidence" USING btree ("investigation_id");
--> statement-breakpoint

ALTER TABLE "field_verification_evidence" DROP CONSTRAINT IF EXISTS "field_verif_evidence_owner_check";
--> statement-breakpoint
ALTER TABLE "field_verification_evidence" ADD CONSTRAINT "field_verif_evidence_owner_check" CHECK (
  "report_id" IS NOT NULL OR "investigation_id" IS NOT NULL
);
--> statement-breakpoint

-- 5. Historical Data Migration: Idempotently populate parcel_discrepancies for existing flagged reports
INSERT INTO "parcel_discrepancies" (
  "case_id",
  "case_parcel_id",
  "report_id",
  "review_id",
  "category",
  "description",
  "status",
  "created_by",
  "created_at",
  "updated_at"
)
SELECT
  acp.case_id,
  fvr.case_parcel_id,
  fvr.id,
  (
    SELECT r.id FROM field_verification_report_reviews r
    WHERE r.report_id = fvr.id AND r.decision = 'DISCREPANCY_FLAGGED'
    ORDER BY r.created_at DESC LIMIT 1
  ),
  'OTHER',
  COALESCE(fvr.review_remarks, 'Discrepancy flagged during field verification review'),
  'OPEN',
  COALESCE(fvr.reviewed_by, fvr.created_by),
  COALESCE(fvr.reviewed_at, fvr.updated_at),
  COALESCE(fvr.reviewed_at, fvr.updated_at)
FROM field_verification_reports fvr
INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
WHERE fvr.status = 'DISCREPANCY_FLAGGED'
  AND NOT EXISTS (
    SELECT 1 FROM parcel_discrepancies pd WHERE pd.report_id = fvr.id
  );

