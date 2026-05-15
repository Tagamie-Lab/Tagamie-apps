CREATE TYPE "public"."asset" AS ENUM('JPYC', 'USDC');--> statement-breakpoint
CREATE TYPE "public"."chain" AS ENUM('polygon', 'base', 'ethereum');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'voided');--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"legal_name" text,
	"tax_number" text,
	"small_amount_exemption_eligible" boolean DEFAULT false NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyers_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "invoice_events" (
	"invoice_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "invoice_events_invoice_id_event_id_pk" PRIMARY KEY("invoice_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_tax_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"event_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"invoice_number" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"small_amount_exemption_applied" boolean DEFAULT false NOT NULL,
	"total_minor" bigint NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"asset" "asset" NOT NULL,
	"pdf_url" text,
	"freee_deal_id" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_number" text NOT NULL,
	"pay_to_address" text NOT NULL,
	"bank_account" jsonb,
	"freee_company_id" text,
	"freee_access_token" text,
	"invoice_counter" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_tax_number_unique" UNIQUE("tax_number"),
	CONSTRAINT "sellers_pay_to_address_unique" UNIQUE("pay_to_address")
);
--> statement-breakpoint
CREATE TABLE "settle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"asset" "asset" NOT NULL,
	"tax_rate_bps" integer DEFAULT 1000 NOT NULL,
	"chain" "chain" NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint,
	"raw_payload" jsonb NOT NULL,
	"resource" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_event_id_settle_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."settle_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tax_lines" ADD CONSTRAINT "invoice_tax_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settle_events" ADD CONSTRAINT "settle_events_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settle_events" ADD CONSTRAINT "settle_events_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_events_event_idx" ON "invoice_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_tax_lines_invoice_rate_uq" ON "invoice_tax_lines" USING btree ("invoice_id","tax_rate_bps");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_seller_buyer_period_uq" ON "invoices" USING btree ("seller_id","buyer_id","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_seller_number_uq" ON "invoices" USING btree ("seller_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "settle_events_chain_tx_hash_uq" ON "settle_events" USING btree ("chain","tx_hash");--> statement-breakpoint
CREATE INDEX "settle_events_seller_buyer_occurred_idx" ON "settle_events" USING btree ("seller_id","buyer_id","occurred_at");