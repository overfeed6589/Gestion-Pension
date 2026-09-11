CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"note" text,
	"last_ordered_at" timestamp,
	"order_requested_at" timestamp,
	"order_requested_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_items_name_idx" ON "inventory_items" ("name");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_order_requested_by_profiles_id_fkey" FOREIGN KEY ("order_requested_by") REFERENCES "profiles"("id") ON DELETE SET NULL;