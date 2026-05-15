CREATE TYPE "public"."tax_number_source" AS ENUM('manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."tax_number_status" AS ENUM('active', 'withdrawn', 'unknown');--> statement-breakpoint
CREATE TABLE "tax_number_cache" (
	"tax_number" text PRIMARY KEY NOT NULL,
	"name" text,
	"registered_at" date,
	"status" "tax_number_status" DEFAULT 'unknown' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "tax_number_source" DEFAULT 'manual' NOT NULL
);
