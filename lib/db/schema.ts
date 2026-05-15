import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
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
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull(),
    asset: assetEnum("asset").notNull(),
    pdfUrl: text("pdf_url"),
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
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull(),
    eventCount: integer("event_count").notNull(),
  },
  (t) => [
    uniqueIndex("invoice_tax_lines_invoice_rate_uq").on(
      t.invoiceId,
      t.taxRateBps,
    ),
  ],
);

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
