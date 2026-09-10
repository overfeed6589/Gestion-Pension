CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scope" text NOT NULL,
	"identifier" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_resume_links" DROP CONSTRAINT "client_resume_links_token_key";--> statement-breakpoint
-- Les anciens liens de reprise (jetons en clair, TTL court) n'ont plus de
-- valeur : on purge avant d'ajouter la colonne NOT NULL token_hash.
DELETE FROM "client_resume_links";--> statement-breakpoint
ALTER TABLE "client_resume_links" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "access_token_hash" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "access_token_rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_resume_links" DROP COLUMN "token";--> statement-breakpoint
ALTER TABLE "client_resume_links" ADD CONSTRAINT "client_resume_links_token_hash_key" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_access_token_hash_key" UNIQUE("access_token_hash");--> statement-breakpoint
CREATE INDEX "rate_limit_scope_ident_idx" ON "rate_limit_hits" ("scope","identifier","created_at");