CREATE TABLE "implementing_agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"agency_type" varchar(50) NOT NULL,
	"parent_agency_id" uuid,
	"administrative_unit_id" uuid,
	"official_website" text,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"source_url" text NOT NULL,
	"source_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"project_type" varchar(50) NOT NULL,
	"implementing_agency_id" uuid NOT NULL,
	"administrative_unit_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"land_acquisition_required" boolean DEFAULT true NOT NULL,
	"estimated_cost" numeric(18, 2),
	"planned_start_date" date,
	"planned_end_date" date,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "implementing_agencies" ADD CONSTRAINT "implementing_agencies_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_implementing_agency_id_implementing_agencies_id_fk" FOREIGN KEY ("implementing_agency_id") REFERENCES "public"."implementing_agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "implementing_agencies_code_idx" ON "implementing_agencies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "implementing_agencies_name_idx" ON "implementing_agencies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "implementing_agencies_status_idx" ON "implementing_agencies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "implementing_agencies_parent_id_idx" ON "implementing_agencies" USING btree ("parent_agency_id");--> statement-breakpoint
CREATE INDEX "implementing_agencies_admin_unit_id_idx" ON "implementing_agencies" USING btree ("administrative_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_project_code_idx" ON "projects" USING btree ("project_code");--> statement-breakpoint
CREATE INDEX "projects_agency_id_idx" ON "projects" USING btree ("implementing_agency_id");--> statement-breakpoint
CREATE INDEX "projects_admin_unit_id_idx" ON "projects" USING btree ("administrative_unit_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_type_idx" ON "projects" USING btree ("project_type");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "implementing_agencies" ADD CONSTRAINT "implementing_agencies_parent_agency_id_fk" FOREIGN KEY ("parent_agency_id") REFERENCES "public"."implementing_agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementing_agencies" ADD CONSTRAINT "implementing_agencies_prevent_self_parent" CHECK ("parent_agency_id" IS NULL OR "parent_agency_id" <> "id");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "project_code_seq" START WITH 1 INCREMENT BY 1;