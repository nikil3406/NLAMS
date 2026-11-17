-- Migration: 0016_competent_authority_scrutiny.sql
-- Step 3C: Competent Authority Scrutiny Observations and Decisions

-- 1. Create proposal_scrutiny_observations table
CREATE TABLE IF NOT EXISTS "proposal_scrutiny_observations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "proposal_id" uuid NOT NULL REFERENCES "acquisition_proposals"("id") ON DELETE CASCADE,
    "proposal_version_id" uuid NOT NULL REFERENCES "acquisition_proposal_versions"("id") ON DELETE CASCADE,
    "observation_category" varchar(50) NOT NULL,
    "observation_title" varchar(255) NOT NULL,
    "observation_description" text NOT NULL,
    "related_section" varchar(100),
    "related_parcel_id" uuid,
    "related_document_id" varchar(255),
    "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "prop_scrutiny_obs_category_check" CHECK (
        "observation_category" IN (
            'PROJECT_JUSTIFICATION',
            'LAND_REQUIREMENT',
            'LAND_RECORDS',
            'PARCEL_DETAILS',
            'DOCUMENTATION',
            'FINANCIAL_INFORMATION',
            'ADMINISTRATIVE_REQUIREMENTS',
            'LEGAL_REQUIREMENTS',
            'OTHER'
        )
    )
);

CREATE INDEX IF NOT EXISTS "prop_scrutiny_obs_proposal_id_idx" ON "proposal_scrutiny_observations" ("proposal_id");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_obs_version_id_idx" ON "proposal_scrutiny_observations" ("proposal_version_id");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_obs_category_idx" ON "proposal_scrutiny_observations" ("observation_category");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_obs_created_by_idx" ON "proposal_scrutiny_observations" ("created_by");

-- 2. Create proposal_scrutiny_decisions table
CREATE TABLE IF NOT EXISTS "proposal_scrutiny_decisions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "proposal_id" uuid NOT NULL REFERENCES "acquisition_proposals"("id") ON DELETE CASCADE,
    "proposal_version_id" uuid NOT NULL REFERENCES "acquisition_proposal_versions"("id") ON DELETE CASCADE,
    "competent_authority_id" uuid NOT NULL REFERENCES "competent_authorities"("id") ON DELETE RESTRICT,
    "decision_type" varchar(50) NOT NULL,
    "decision_remarks" text NOT NULL,
    "supporting_documents" jsonb,
    "decided_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "prop_scrutiny_dec_type_check" CHECK (
        "decision_type" IN ('APPROVED', 'CORRECTION_REQUESTED', 'REJECTED')
    )
);

CREATE INDEX IF NOT EXISTS "prop_scrutiny_dec_proposal_id_idx" ON "proposal_scrutiny_decisions" ("proposal_id");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_dec_version_id_idx" ON "proposal_scrutiny_decisions" ("proposal_version_id");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_dec_authority_id_idx" ON "proposal_scrutiny_decisions" ("competent_authority_id");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_dec_decided_by_idx" ON "proposal_scrutiny_decisions" ("decided_by");
CREATE INDEX IF NOT EXISTS "prop_scrutiny_dec_type_idx" ON "proposal_scrutiny_decisions" ("decision_type");
