-- Migration: 0013_proposal_validation_submission_versioning.sql
-- Step 2: Proposal Validation, Submission & Version Management

-- 1. Update proposal header status check to support CORRECTION_REQUESTED
ALTER TABLE "acquisition_proposals" DROP CONSTRAINT IF EXISTS "acquisition_proposals_status_check";
ALTER TABLE "acquisition_proposals" ADD CONSTRAINT "acquisition_proposals_status_check" CHECK ("current_status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED'));

-- 2. Add submission, review, and previous version link columns to proposal versions
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "submitted_by" uuid REFERENCES "public"."users"("id") ON DELETE restrict;
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "public"."users"("id") ON DELETE restrict;
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "review_remarks" text;
ALTER TABLE "acquisition_proposal_versions" ADD COLUMN IF NOT EXISTS "previous_version_id" uuid REFERENCES "public"."acquisition_proposal_versions"("id") ON DELETE set null;

-- 3. Update proposal version status check constraint
ALTER TABLE "acquisition_proposal_versions" DROP CONSTRAINT IF EXISTS "acquisition_proposal_versions_status_check";
ALTER TABLE "acquisition_proposal_versions" ADD CONSTRAINT "acquisition_proposal_versions_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED'));

-- 4. Create indexes for new columns
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_submitted_by_idx" ON "acquisition_proposal_versions" ("submitted_by");
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_reviewed_by_idx" ON "acquisition_proposal_versions" ("reviewed_by");
CREATE INDEX IF NOT EXISTS "acquisition_proposal_versions_prev_ver_idx" ON "acquisition_proposal_versions" ("previous_version_id");

-- 5. Expand workflow history allowed actions
ALTER TABLE "acquisition_proposal_workflow_history" DROP CONSTRAINT IF EXISTS "acq_prop_wf_history_action_check";
ALTER TABLE "acquisition_proposal_workflow_history" ADD CONSTRAINT "acq_prop_wf_history_action_check" CHECK ("action" IN ('CREATE_DRAFT', 'UPDATE_DRAFT', 'VALIDATE', 'SUBMIT', 'START_REVIEW', 'REQUEST_CORRECTIONS', 'CREATE_VERSION', 'RESUBMIT', 'APPROVE', 'REJECT'));

