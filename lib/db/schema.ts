import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Token-amount columns hold minor units (wei for 18-decimal JPYC, micros for 6-decimal USDC).
 * Postgres `bigint` (int8) caps at ~9.2e18, which overflows for any JPYC amount ≥ 10 JPYC
 * (¥10 = 1e19 wei). Use `numeric(78, 0)` to handle the full 256-bit on-chain range while
 * keeping the JS-side API as native `bigint` (Drizzle's "bigint" mode).
 */
const amountColumn = (name: string) =>
  numeric(name, { precision: 78, scale: 0, mode: "bigint" });

export const chainEnum = pgEnum("chain", [
  "polygon",
  "base",
  "ethereum",
  "kaia",
  "polygonAmoy",
  "kaiaKairos",
]);
export const assetEnum = pgEnum("asset", ["JPYC", "USDC"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "voided",
]);

export const sellers = pgTable("sellers", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  legalName: text("legal_name").notNull(),
  taxNumber: text("tax_number").notNull().unique(),
  payToAddress: text("pay_to_address").notNull().unique(),
  email: text("email"),
  transactionAgentName: text("transaction_agent_name"),
  businessAddress: text("business_address"),
  industry: text("industry"),
  bankAccount: jsonb("bank_account"),
  freeeCompanyId: text("freee_company_id"),
  freeeAccessToken: text("freee_access_token"),
  invoiceCounter: integer("invoice_counter").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const buyers = pgTable("buyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull().unique(),
  legalName: text("legal_name"),
  businessName: text("business_name"),
  taxNumber: text("tax_number"),
  smallAmountExemptionEligible: boolean("small_amount_exemption_eligible")
    .notNull()
    .default(false),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const walletOwnerTypeEnum = pgEnum("wallet_owner_type", [
  "seller",
  "buyer",
]);

/**
 * Multi-wallet registry. Each seller/buyer can have multiple wallets across chains.
 * Wallet ownership is verified via SIWE (EIP-4361) at registration time.
 * The seller.payToAddress / buyer.walletAddress columns remain as the
 * "primary" address for backward compatibility; this table is the authoritative
 * source for multi-wallet lookups by Phase 0-A indexer.
 */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    address: text("address").notNull(),
    ownerType: walletOwnerTypeEnum("owner_type").notNull(),
    sellerId: uuid("seller_id").references(() => sellers.id, {
      onDelete: "cascade",
    }),
    buyerId: uuid("buyer_id").references(() => buyers.id, {
      onDelete: "cascade",
    }),
    label: text("label"),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("wallets_address_owner_type_uq").on(t.address, t.ownerType),
    index("wallets_seller_idx").on(t.sellerId),
    index("wallets_buyer_idx").on(t.buyerId),
  ],
);

/**
 * SIWE nonces for CSRF protection. Each nonce is single-use and short-lived.
 * Nonces are deleted on successful verify or after expiresAt elapses (cleanup job TBD).
 */
export const authNonces = pgTable(
  "auth_nonces",
  {
    nonce: text("nonce").primaryKey(),
    address: text("address"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("auth_nonces_expires_idx").on(t.expiresAt)],
);

/**
 * Terms of service acceptance log (個情法対応、 jpyc-privacy 先例に整合).
 * Stored per wallet address since users authenticate by wallet.
 */
export const termsAcceptance = pgTable("terms_acceptance", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull(),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const settleEvents = pgTable(
  "settle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id),
    amountMinor: amountColumn("amount_minor").notNull(),
    asset: assetEnum("asset").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(1000),
    chain: chainEnum("chain").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    rawPayload: jsonb("raw_payload").notNull(),
    resource: text("resource"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("settle_events_chain_tx_hash_uq").on(t.chain, t.txHash),
    index("settle_events_seller_buyer_occurred_idx").on(
      t.sellerId,
      t.buyerId,
      t.occurredAt,
    ),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id),
    periodMonth: date("period_month").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    smallAmountExemptionApplied: boolean("small_amount_exemption_applied")
      .notNull()
      .default(false),
    totalMinor: amountColumn("total_minor").notNull(),
    subtotalMinor: amountColumn("subtotal_minor").notNull(),
    taxMinor: amountColumn("tax_minor").notNull(),
    asset: assetEnum("asset").notNull(),
    pdfUrl: text("pdf_url"),
    pdfHash: text("pdf_hash"),
    ipfsPdfCid: text("ipfs_pdf_cid"),
    ipfsMetadataCid: text("ipfs_metadata_cid"),
    eip712Signature: text("eip712_signature"),
    eip712MessageHash: text("eip712_message_hash"),
    nftChain: chainEnum("nft_chain"),
    nftContract: text("nft_contract"),
    nftTokenId: text("nft_token_id"),
    nftMintedAt: timestamp("nft_minted_at", { withTimezone: true }),
    nftMintTxHash: text("nft_mint_tx_hash"),
    freeeDealId: text("freee_deal_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_seller_buyer_period_uq").on(
      t.sellerId,
      t.buyerId,
      t.periodMonth,
    ),
    uniqueIndex("invoices_seller_number_uq").on(t.sellerId, t.invoiceNumber),
  ],
);

export const invoiceTaxLines = pgTable(
  "invoice_tax_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    taxRateBps: integer("tax_rate_bps").notNull(),
    subtotalMinor: amountColumn("subtotal_minor").notNull(),
    taxMinor: amountColumn("tax_minor").notNull(),
    eventCount: integer("event_count").notNull(),
  },
  (t) => [
    uniqueIndex("invoice_tax_lines_invoice_rate_uq").on(
      t.invoiceId,
      t.taxRateBps,
    ),
  ],
);

export const taxNumberStatusEnum = pgEnum("tax_number_status", [
  "active",
  "withdrawn",
  "unknown",
]);

export const taxNumberSourceEnum = pgEnum("tax_number_source", ["manual", "api"]);

export const taxNumberCache = pgTable("tax_number_cache", {
  taxNumber: text("tax_number").primaryKey(),
  name: text("name"),
  registeredAt: date("registered_at"),
  status: taxNumberStatusEnum("status").notNull().default("unknown"),
  verifiedAt: timestamp("verified_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  source: taxNumberSourceEnum("source").notNull().default("manual"),
});

export const invoiceEvents = pgTable(
  "invoice_events",
  {
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => settleEvents.id),
  },
  (t) => [
    primaryKey({ columns: [t.invoiceId, t.eventId] }),
    index("invoice_events_event_idx").on(t.eventId),
  ],
);
