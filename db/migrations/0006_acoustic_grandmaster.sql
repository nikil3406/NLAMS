CREATE TABLE "land_parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" varchar(50) NOT NULL,
	"administrative_unit_id" uuid,
	"state" varchar(100) NOT NULL,
	"district" varchar(100) NOT NULL,
	"taluk" varchar(100) NOT NULL,
	"village" varchar(100) NOT NULL,
	"survey_number" varchar(100) NOT NULL,
	"subdivision_number" varchar(100),
	"land_record_reference" varchar(255),
	"total_area" numeric(18, 4) NOT NULL,
	"area_unit" varchar(50) NOT NULL,
	"land_use" varchar(100),
	"physical_description" text,
	"geometry" geometry(Geometry, 4326),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "land_parcels_total_area_check" CHECK ("land_parcels"."total_area" > 0),
	CONSTRAINT "land_parcels_area_unit_check" CHECK ("land_parcels"."area_unit" IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM'))
);
--> statement-breakpoint
CREATE TABLE "acquisition_case_parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"parcel_id" uuid NOT NULL,
	"proposed_affected_area" numeric(18, 4) NOT NULL,
	"affected_area_unit" varchar(50) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acq_case_parcels_proposed_area_check" CHECK ("acquisition_case_parcels"."proposed_affected_area" > 0),
	CONSTRAINT "acq_case_parcels_affected_area_unit_check" CHECK ("acquisition_case_parcels"."affected_area_unit" IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM'))
);
--> statement-breakpoint
CREATE TABLE "field_verification_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_parcel_id" uuid NOT NULL,
	"verified_by" uuid,
	"verification_date" timestamp with time zone,
	"outcome" varchar(50),
	"observations" text,
	"measured_area" numeric(18, 4),
	"measured_area_unit" varchar(50),
	"measurement_method" varchar(100),
	"measurement_notes" text,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_verif_reports_measured_area_check" CHECK ("field_verification_reports"."measured_area" IS NULL OR "field_verification_reports"."measured_area" > 0),
	CONSTRAINT "field_verif_reports_measured_area_unit_check" CHECK ("field_verification_reports"."measured_area_unit" IS NULL OR "field_verification_reports"."measured_area_unit" IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM')),
	CONSTRAINT "field_verif_reports_outcome_check" CHECK ("field_verification_reports"."outcome" IS NULL OR "field_verification_reports"."outcome" IN ('VERIFIED', 'DISCREPANCY_FOUND', 'INCONCLUSIVE')),
	CONSTRAINT "field_verif_reports_status_check" CHECK ("field_verification_reports"."status" IN ('DRAFT', 'SUBMITTED'))
);
--> statement-breakpoint
ALTER TABLE "land_parcels" ADD CONSTRAINT "land_parcels_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_parcels" ADD CONSTRAINT "land_parcels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_case_parcels" ADD CONSTRAINT "acquisition_case_parcels_case_id_acquisition_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_case_parcels" ADD CONSTRAINT "acquisition_case_parcels_parcel_id_land_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."land_parcels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_case_parcels" ADD CONSTRAINT "acquisition_case_parcels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_verification_reports" ADD CONSTRAINT "field_verification_reports_case_parcel_id_acquisition_case_parcels_id_fk" FOREIGN KEY ("case_parcel_id") REFERENCES "public"."acquisition_case_parcels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_verification_reports" ADD CONSTRAINT "field_verification_reports_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_verification_reports" ADD CONSTRAINT "field_verification_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "land_parcels_parcel_id_idx" ON "land_parcels" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "land_parcels_locality_survey_idx" ON "land_parcels" USING btree ("state","district","taluk","village","survey_number","subdivision_number");--> statement-breakpoint
CREATE INDEX "land_parcels_village_survey_idx" ON "land_parcels" USING btree ("village","survey_number");--> statement-breakpoint
CREATE INDEX "land_parcels_admin_unit_id_idx" ON "land_parcels" USING btree ("administrative_unit_id");--> statement-breakpoint
CREATE INDEX "land_parcels_created_by_idx" ON "land_parcels" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "acq_case_parcels_case_parcel_idx" ON "acquisition_case_parcels" USING btree ("case_id","parcel_id");--> statement-breakpoint
CREATE INDEX "acq_case_parcels_case_id_idx" ON "acquisition_case_parcels" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "acq_case_parcels_parcel_id_idx" ON "acquisition_case_parcels" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "acq_case_parcels_created_by_idx" ON "acquisition_case_parcels" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "field_verif_reports_case_parcel_id_idx" ON "field_verification_reports" USING btree ("case_parcel_id");--> statement-breakpoint
CREATE INDEX "field_verif_reports_verified_by_idx" ON "field_verification_reports" USING btree ("verified_by");--> statement-breakpoint
CREATE INDEX "field_verif_reports_status_idx" ON "field_verification_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_verif_reports_outcome_idx" ON "field_verification_reports" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "field_verif_reports_created_at_idx" ON "field_verification_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "land_parcels_geometry_idx" ON "land_parcels" USING gist ("geometry");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "land_parcel_id_seq" START WITH 1 INCREMENT BY 1;