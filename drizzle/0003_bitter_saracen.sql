ALTER TABLE "invoice_tax_lines" ALTER COLUMN "subtotal_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "invoice_tax_lines" ALTER COLUMN "tax_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subtotal_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "settle_events" ALTER COLUMN "amount_minor" SET DATA TYPE numeric(78, 0);