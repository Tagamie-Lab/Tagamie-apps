ALTER TABLE "sellers" ADD COLUMN "default_tax_rate_bps" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settle_events" ADD COLUMN "block_timestamp" timestamp with time zone;