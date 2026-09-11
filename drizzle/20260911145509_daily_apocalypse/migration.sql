CREATE TABLE "audit_logs_archive" (
	"id" uuid PRIMARY KEY,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_archive_entity_idx" ON "audit_logs_archive" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_date_idx" ON "audit_logs_archive" ("created_at");