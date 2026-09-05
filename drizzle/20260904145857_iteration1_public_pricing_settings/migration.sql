CREATE TABLE "pension_settings" (
	"id" text PRIMARY KEY,
	"pension_name" text NOT NULL,
	"legal_address" text,
	"siret" varchar(14),
	"contact_email" text,
	"phone" text,
	"deposit_percent" integer DEFAULT 30 NOT NULL,
	"cancellation_refund_days" integer DEFAULT 7 NOT NULL,
	"offer_validity_hours" integer DEFAULT 72 NOT NULL,
	"public_domain" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" text DEFAULT 'phone' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offered_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
ALTER TABLE "housing_categories" ADD COLUMN "surcharge_per_animal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "housing_categories" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "housing_categories" ADD COLUMN "public_name" text;--> statement-breakpoint
ALTER TABLE "housing_categories" ADD COLUMN "public_description" text;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'requested';