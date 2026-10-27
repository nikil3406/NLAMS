CREATE TABLE IF NOT EXISTS "field_verification_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"evidence_type" varchar(50) NOT NULL,
	"file_reference" varchar(255) NOT NULL,
	"caption" varchar(255),
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_verification_evidence" ADD CONSTRAINT "field_verification_evidence_report_id_field_verification_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."field_verification_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_verification_evidence" ADD CONSTRAINT "field_verification_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_verif_evidence_report_id_idx" ON "field_verification_evidence" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_verif_evidence_created_by_idx" ON "field_verification_evidence" USING btree ("created_by");
