import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Union of the top-level `db` (PostgresJsDatabase) and the `tx` argument passed
 * to a `db.transaction(...)` callback (PgTransaction). PgTransaction lacks
 * `$client` so `typeof db` alone won't accept it — we widen via
 * `Parameters<...>` so `allocateInvoiceNumber` can be called either standalone
 * or inside an aggregation transaction without losing type-safety.
 */
type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PeriodBoundsJST {
  /** Start of month in UTC (representing 00:00 JST of day 1) */
  startUtc: Date;
  /** Start of next month in UTC (exclusive upper bound) */
  endUtc: Date;
  /** First day of the month as a date-only string (YYYY-MM-01), used as period_month */
  periodMonth: string;
}

/**
 * Compute UTC bounds for a JST calendar month (year, month1based).
 * JST is UTC+9 with no DST.
 */
export function jstMonthBounds(year: number, month1based: number): PeriodBoundsJST {
  const startJstMidnight = Date.UTC(year, month1based - 1, 1, -9, 0, 0);
  const endJstMidnight = Date.UTC(year, month1based, 1, -9, 0, 0);
  const periodMonth = `${year.toString().padStart(4, "0")}-${month1based
    .toString()
    .padStart(2, "0")}-01`;
  return {
    startUtc: new Date(startJstMidnight),
    endUtc: new Date(endJstMidnight),
    periodMonth,
  };
}

/** Distinct (sellerId, buyerId) pairs that had at least one settle event in the JST month. */
export async function listSellerBuyerPairsInPeriod(
  bounds: PeriodBoundsJST,
): Promise<Array<{ sellerId: string; buyerId: string }>> {
  const rows = await db
    .selectDistinct({
      sellerId: schema.settleEvents.sellerId,
      buyerId: schema.settleEvents.buyerId,
    })
    .from(schema.settleEvents)
    .where(
      and(
        gte(schema.settleEvents.occurredAt, bounds.startUtc),
        lt(schema.settleEvents.occurredAt, bounds.endUtc),
      ),
    );
  return rows;
}

export interface TaxRateGroup {
  taxRateBps: number;
  /** Tax-inclusive total (minor units) */
  totalMinor: bigint;
  /** Pre-tax subtotal (minor units), floor-divided so tax absorbs the rounding */
  subtotalMinor: bigint;
  /** Tax amount (minor units) = totalMinor - subtotalMinor */
  taxMinor: bigint;
  eventCount: number;
  eventIds: string[];
  /** Whether every event in this group is below ¥10K (used by exemption logic).
   *  Always false for non-JPYC assets, since the exemption is a JP yen-denominated rule. */
  allBelowSmallAmountThreshold: boolean;
}

// JPYC has 18 decimals and 1 JPYC = ¥1, so ¥10,000 = 10000 * 10^18 raw minor units.
// Small-amount exemption only applies to JPYC-denominated transactions.
const SMALL_AMOUNT_THRESHOLD_MINOR_JPYC = 10_000n * 10n ** 18n;

/**
 * Aggregate one (seller, buyer, period) bucket grouped by tax rate.
 * amount_minor is treated as tax-inclusive; subtotal is floored, tax catches the remainder.
 */
export async function aggregateBucket(
  sellerId: string,
  buyerId: string,
  bounds: PeriodBoundsJST,
): Promise<TaxRateGroup[]> {
  const events = await db
    .select({
      id: schema.settleEvents.id,
      taxRateBps: schema.settleEvents.taxRateBps,
      amountMinor: schema.settleEvents.amountMinor,
      asset: schema.settleEvents.asset,
    })
    .from(schema.settleEvents)
    .where(
      and(
        eq(schema.settleEvents.sellerId, sellerId),
        eq(schema.settleEvents.buyerId, buyerId),
        gte(schema.settleEvents.occurredAt, bounds.startUtc),
        lt(schema.settleEvents.occurredAt, bounds.endUtc),
      ),
    )
    .orderBy(asc(schema.settleEvents.occurredAt));

  const groups = new Map<number, TaxRateGroup>();
  for (const e of events) {
    const g = groups.get(e.taxRateBps) ?? {
      taxRateBps: e.taxRateBps,
      totalMinor: 0n,
      subtotalMinor: 0n,
      taxMinor: 0n,
      eventCount: 0,
      eventIds: [],
      allBelowSmallAmountThreshold: true,
    };
    g.totalMinor += e.amountMinor;
    g.eventCount += 1;
    g.eventIds.push(e.id);
    // Exemption is JPY-denominated. Only JPYC events under ¥10K count.
    // Any non-JPYC or any JPYC ≥ ¥10K disqualifies the group.
    if (
      e.asset !== "JPYC" ||
      e.amountMinor >= SMALL_AMOUNT_THRESHOLD_MINOR_JPYC
    ) {
      g.allBelowSmallAmountThreshold = false;
    }
    groups.set(e.taxRateBps, g);
  }

  for (const g of groups.values()) {
    const denom = 10000n + BigInt(g.taxRateBps);
    g.subtotalMinor = (g.totalMinor * 10000n) / denom; // bigint floor division
    g.taxMinor = g.totalMinor - g.subtotalMinor;
  }

  return Array.from(groups.values()).sort((a, b) => a.taxRateBps - b.taxRateBps);
}

/**
 * Atomically allocate the next invoice number for a seller. Must run inside the
 * caller's transaction so that, if the surrounding invoice INSERT fails (e.g.
 * unique-constraint conflict on (seller, buyer, period)), the counter
 * increment rolls back too — preventing "phantom gap" 採番 numbers that 監査
 * tends to question. Combined with `pg_advisory_xact_lock` on (seller,
 * period) in [[aggregate.ts]], this serialises same-bucket aggregation.
 */
export async function allocateInvoiceNumber(
  tx: DbOrTx,
  sellerId: string,
  periodMonth: string,
): Promise<string> {
  const [row] = await tx
    .update(schema.sellers)
    .set({ invoiceCounter: sql`${schema.sellers.invoiceCounter} + 1` })
    .where(eq(schema.sellers.id, sellerId))
    .returning({ counter: schema.sellers.invoiceCounter });
  if (!row) throw new Error(`seller ${sellerId} not found`);
  const [year, month] = periodMonth.split("-");
  return `INV-${year}-${month}-${row.counter.toString().padStart(4, "0")}`;
}

export const _internal = { SMALL_AMOUNT_THRESHOLD_MINOR_JPYC };
