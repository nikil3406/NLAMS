-- Migration: 0010_field_verification_completed_status.sql
-- Step 7: Add FIELD_VERIFICATION_COMPLETED to acquisition cases

-- acquisition_cases.status check constraint (if any) or documentation
-- In schema, status is varchar(50) NOT NULL. No check constraint was defined on acquisition_cases.status in migration 0004.
-- This migration documents the new valid workflow state.
COMMENT ON COLUMN "acquisition_cases"."status" IS 'Valid statuses: DRAFT, SUBMITTED, AWAITING_FIELD_VERIFICATION, FIELD_VERIFICATION_COMPLETED, RETURNED_FOR_CORRECTION, REJECTED';

