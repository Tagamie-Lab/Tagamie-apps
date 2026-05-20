ALTER TABLE "invoices" DROP COLUMN "ipfs_pdf_cid";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "ipfs_metadata_cid";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "eip712_signature";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "eip712_message_hash";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "nft_chain";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "nft_contract";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "nft_token_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "nft_minted_at";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "nft_mint_tx_hash";