CREATE TYPE "public"."wallet_owner_type" AS ENUM('seller', 'buyer');--> statement-breakpoint
ALTER TYPE "public"."chain" ADD VALUE 'kaia';--> statement-breakpoint
ALTER TYPE "public"."chain" ADD VALUE 'polygonAmoy';--> statement-breakpoint
ALTER TYPE "public"."chain" ADD VALUE 'kaiaKairos';--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "terms_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"owner_type" "wallet_owner_type" NOT NULL,
	"seller_id" uuid,
	"buyer_id" uuid,
	"label" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "transaction_agent_name" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "business_address" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_nonces_expires_idx" ON "auth_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_address_owner_type_uq" ON "wallets" USING btree ("address","owner_type");--> statement-breakpoint
CREATE INDEX "wallets_seller_idx" ON "wallets" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "wallets_buyer_idx" ON "wallets" USING btree ("buyer_id");