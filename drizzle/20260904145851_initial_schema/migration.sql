CREATE TABLE "booking_extra_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booking_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"pet_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total_price" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "booking_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booking_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"unit_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"segment_price" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_price" integer NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"check_in_date" timestamp NOT NULL,
	"check_out_date" timestamp NOT NULL,
	"actual_check_in" timestamp,
	"actual_check_out" timestamp,
	"diet_notes" text,
	"belongings_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"phone" text NOT NULL,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"stripe_customer_id" text,
	"siret" varchar(14),
	"vat_number" varchar(32),
	"is_b2b" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid NOT NULL,
	"channel" text DEFAULT 'web_chat' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pet_id" uuid NOT NULL,
	"segment_id" uuid,
	"report_date" date NOT NULL,
	"appetite" text,
	"stool_condition" text,
	"behavior" text,
	"medication_given" boolean DEFAULT false NOT NULL,
	"medication_notes" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"default_price" integer NOT NULL,
	"billing_type" text DEFAULT 'per_unit' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "housing_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"unit_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "housing_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"base_price_per_night" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "housing_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid,
	"pet_id" uuid,
	"booking_id" uuid,
	"author_type" text DEFAULT 'staff' NOT NULL,
	"content" text NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"invoice_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_in_cents" integer NOT NULL,
	"total_in_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"invoice_number" varchar(50) NOT NULL UNIQUE,
	"type" varchar(20) DEFAULT 'final' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"e_invoice_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"pennylane_id" varchar(255),
	"transmitted_at" timestamp,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"subtotal_in_cents" integer NOT NULL,
	"tax_in_cents" integer DEFAULT 0 NOT NULL,
	"total_in_cents" integer NOT NULL,
	"vat_rate" integer DEFAULT 2000 NOT NULL,
	"pdf_url" text,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"content" text NOT NULL,
	"is_approved_by_human" boolean DEFAULT true NOT NULL,
	"ai_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"booking_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"method" text NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"status" text NOT NULL,
	"metadata" jsonb,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"breed" text,
	"sex" text NOT NULL,
	"is_sterilized" boolean DEFAULT false NOT NULL,
	"birth_date" date,
	"identification_number" text NOT NULL,
	"passport_number" text,
	"veterinarian_name" text,
	"veterinarian_phone" text,
	"vaccines_up_to_date" boolean DEFAULT true NOT NULL,
	"vaccines" jsonb DEFAULT '[]' NOT NULL,
	"medical_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY,
	"role" text NOT NULL,
	"full_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"purchase_order_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost_in_cents" integer NOT NULL,
	"total_cost_in_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_number" varchar(50) NOT NULL UNIQUE,
	"supplier_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_cost_in_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sent_at" timestamp,
	"expected_delivery_date" timestamp,
	"received_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"segment_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"contact_email" varchar(255),
	"phone" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "invoices_client_id_idx" ON "invoices" ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_booking_id_idx" ON "invoices" ("booking_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders" ("supplier_id");--> statement-breakpoint
ALTER TABLE "booking_extra_services" ADD CONSTRAINT "booking_extra_services_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_extra_services" ADD CONSTRAINT "booking_extra_services_service_id_extra_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "extra_services"("id");--> statement-breakpoint
ALTER TABLE "booking_extra_services" ADD CONSTRAINT "booking_extra_services_pet_id_pets_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_category_id_housing_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "housing_categories"("id");--> statement-breakpoint
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_unit_id_housing_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "housing_units"("id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_pet_id_pets_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_segment_id_booking_segments_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "booking_segments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "housing_blocks" ADD CONSTRAINT "housing_blocks_unit_id_housing_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "housing_units"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "housing_units" ADD CONSTRAINT "housing_units_category_id_housing_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "housing_categories"("id");--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_pet_id_pets_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");--> statement-breakpoint
ALTER TABLE "segment_pets" ADD CONSTRAINT "segment_pets_segment_id_booking_segments_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "booking_segments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "segment_pets" ADD CONSTRAINT "segment_pets_pet_id_pets_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE;