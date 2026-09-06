CREATE TABLE "client_resume_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booking_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "arrival_time_slot" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "departure_time_slot" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "pension_settings" ADD COLUMN "arrival_slots" jsonb;--> statement-breakpoint
ALTER TABLE "pension_settings" ADD COLUMN "departure_slots" jsonb;--> statement-breakpoint
ALTER TABLE "pension_settings" ADD COLUMN "reminder_days" jsonb;--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "identification_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_access_token_key" UNIQUE("access_token");--> statement-breakpoint
CREATE INDEX "outbound_emails_booking_kind_idx" ON "outbound_emails" ("booking_id","kind");--> statement-breakpoint
ALTER TABLE "client_resume_links" ADD CONSTRAINT "client_resume_links_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;