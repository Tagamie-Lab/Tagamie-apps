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

export const chainEnum = pgEnum("chain", ["polygon", "base", "ethereum"]);
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
  taxNumber: text("tax_number"),
  smallAmountExemptionEligible: boolean("small_amount_exemption_eligible")
    .notNull()
    .default(false),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
