CREATE TABLE "project_boundary_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"geometry" geometry(Geometry, 4326) NOT NULL,
	"estimated_land_area" numeric(18, 2) NOT NULL,
	"estimated_area_unit" varchar(50) NOT NULL,
	"calculated_geometry_area" numeric(18, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_reason" text
);
--> statement-breakpoint
ALTER TABLE "project_boundary_versions" ADD CONSTRAINT "project_boundary_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_boundary_versions" ADD CONSTRAINT "project_boundary_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_boundary_versions_project_version_idx" ON "project_boundary_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "project_boundary_versions_project_id_idx" ON "project_boundary_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_boundary_versions_created_by_idx" ON "project_boundary_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "project_boundary_versions_geometry_idx" ON "project_boundary_versions" USING gist ("geometry");