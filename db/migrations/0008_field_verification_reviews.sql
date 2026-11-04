-- Migration: 0008_field_verification_reviews.sql
-- Step 5B: Land Officer Review Workflow, Corrections, and Audit History

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "public"."users"("id") ON DELETE restrict;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "review_decision" varchar(50);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "review_remarks" text;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "previous_report_id" uuid REFERENCES "public"."field_verification_reports"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_reports" ADD COLUMN IF NOT EXISTS "revision_number" integer DEFAULT 1 NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint

-- Update status check constraint to support review statuses
ALTER TABLE "field_verification_reports" DROP CONSTRAINT IF EXISTS "field_verif_reports_status_check";
--> statement-breakpoint
ALTER TABLE "field_verification_reports" ADD CONSTRAINT "field_verif_reports_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED_FOR_CORRECTION', 'DISCREPANCY_FLAGGED'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "field_verif_reports_reviewed_by_idx" ON "field_verification_reports" USING btree ("reviewed_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_verif_reports_prev_report_id_idx" ON "field_verification_reports" USING btree ("previous_report_id");
--> statement-breakpoint

-- Dedicated review audit history table
CREATE TABLE IF NOT EXISTS "field_verification_report_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "reviewer_id" uuid NOT NULL,
  "decision" varchar(50) NOT NULL,
  "from_status" varchar(50) NOT NULL,
  "to_status" varchar(50) NOT NULL,
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_report_reviews" ADD CONSTRAINT "field_verif_reviews_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."field_verification_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "field_verification_report_reviews" ADD CONSTRAINT "field_verif_reviews_reviewer_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "field_verif_reviews_report_id_idx" ON "field_verification_report_reviews" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_verif_reviews_reviewer_id_idx" ON "field_verification_report_reviews" USING btree ("reviewer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_verif_reviews_created_at_idx" ON "field_verification_report_reviews" USING btree ("created_at");

