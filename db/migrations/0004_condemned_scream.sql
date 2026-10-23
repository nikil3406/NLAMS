CREATE TABLE "acquisition_case_workflow_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"case_reference" varchar(50) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"actor_id" uuid NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acquisition_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_reference" varchar(50) NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"submission_remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acquisition_case_workflow_history" ADD CONSTRAINT "acquisition_case_workflow_history_case_id_acquisition_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."acquisition_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_case_workflow_history" ADD CONSTRAINT "acquisition_case_workflow_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_cases" ADD CONSTRAINT "acquisition_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_cases" ADD CONSTRAINT "acquisition_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_cases" ADD CONSTRAINT "acquisition_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acq_case_workflow_history_case_id_idx" ON "acquisition_case_workflow_history" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "acq_case_workflow_history_case_ref_idx" ON "acquisition_case_workflow_history" USING btree ("case_reference");--> statement-breakpoint
CREATE INDEX "acq_case_workflow_history_actor_id_idx" ON "acquisition_case_workflow_history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "acq_case_workflow_history_created_at_idx" ON "acquisition_case_workflow_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_cases_case_reference_idx" ON "acquisition_cases" USING btree ("case_reference");--> statement-breakpoint
CREATE INDEX "acquisition_cases_project_id_idx" ON "acquisition_cases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "acquisition_cases_status_idx" ON "acquisition_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "acquisition_cases_created_by_idx" ON "acquisition_cases" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "acquisition_cases_updated_by_idx" ON "acquisition_cases" USING btree ("updated_by");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "acquisition_case_ref_seq" START WITH 1 INCREMENT BY 1;