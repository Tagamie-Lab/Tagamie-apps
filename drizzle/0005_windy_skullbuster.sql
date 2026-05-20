ALTER TABLE "invoices" ADD COLUMN "ipfs_pdf_cid" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ipfs_metadata_cid" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "eip712_signature" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "eip712_message_hash" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nft_chain" "chain";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nft_contract" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nft_token_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nft_minted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nft_mint_tx_hash" text;