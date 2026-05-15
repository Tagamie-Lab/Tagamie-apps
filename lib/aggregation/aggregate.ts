import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  aggregateBucket,
  allocateInvoiceNumber,
  jstMonthBounds,
  listSellerBuyerPairsInPeriod,
  type PeriodBoundsJST,
  type TaxRateGroup,
} from "./queries";
import { applySmallAmountExemption } from "./exemption";

export interface BucketResult {
  sellerId: string;
  buyerId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  status: "created" | "skipped_existing" | "skipped_empty";
  totalMinor: bigint;
  groupCount: number;
  smallAmountExemptionApplied: boolean;
}

export interface PeriodAggregationResult {
  periodMonth: string;
  bucketsConsidered: number;
  buckets: BucketResult[];
}

/**
 * Aggregate one (seller, buyer) bucket into a draft invoice.
 * - Idempotent via unique(seller_id, buyer_id, period_month).
 * - Single asset assumed per bucket (mixed assets would split into multiple invoices in a future iteration).
 */
async function aggregateOneBucket(
  sellerId: string,
  buyerId: string,
  bounds: PeriodBoundsJST,
): Promise<BucketResult> {
  const groups = await aggregateBucket(sellerId, buyerId, bounds);
  if (groups.length === 0) {
    return {
      sellerId,
      buyerId,
      status: "skipped_empty",
      totalMinor: 0n,
      groupCount: 0,
      smallAmountExemptionApplied: false,
    };
  }

  const buyer = await db.query.buyers.findFirst({
    where: eq(schema.buyers.id, buyerId),
  });
  if (!buyer) throw new Error(`buyer ${buyerId} not found`);

  // We only support a single asset per invoice for now. Pull it from the first event of the bucket.
  const [firstEvent] = await db
    .select({ asset: schema.settleEvents.asset })
    .from(schema.settleEvents)
    .where(
      and(
        eq(schema.settleEvents.sellerId, sellerId),
        eq(schema.settleEvents.buyerId, buyerId),
      ),
    )
    .limit(1);
  if (!firstEvent) throw new Error("no events found despite group count > 0");

  const exemptionApplied = applySmallAmountExemption({
    periodMonth: bounds.periodMonth,
    buyerEligible: buyer.smallAmountExemptionEligible,
    groups,
  });

  const totalMinor = groups.reduce((s, g) => s + g.totalMinor, 0n);
  const subtotalMinor = groups.reduce((s, g) => s + g.subtotalMinor, 0n);
  const taxMinor = groups.reduce((s, g) => s + g.taxMinor, 0n);

  // Wrap insert + tax_lines + event links in a transaction so failure leaves no partials.
  const result = await db.transaction(async (tx) => {
    // Try to claim this period; if already claimed, skip.
    const existing = await tx.query.invoices.findFirst({
      where: and(
        eq(schema.invoices.sellerId, sellerId),
        eq(schema.invoices.buyerId, buyerId),
        eq(schema.invoices.periodMonth, bounds.periodMonth),
      ),
    });
    if (existing) {
      return {
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        status: "skipped_existing" as const,
      };
    }

    const invoiceNumber = await allocateInvoiceNumber(sellerId, bounds.periodMonth);

    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        sellerId,
        buyerId,
        periodMonth: bounds.periodMonth,
        invoiceNumber,
        status: "draft",
        smallAmountExemptionApplied: exemptionApplied,
        totalMinor,
        subtotalMinor,
        taxMinor,
        asset: firstEvent.asset,
      })
      .returning({ id: schema.invoices.id });

    await tx.insert(schema.invoiceTaxLines).values(
      groups.map((g) => ({
        invoiceId: inv.id,
        taxRateBps: g.taxRateBps,
        subtotalMinor: g.subtotalMinor,
        taxMinor: g.taxMinor,
        eventCount: g.eventCount,
      })),
    );

    const allEventIds = groups.flatMap((g) => g.eventIds);
    if (allEventIds.length > 0) {
      await tx.insert(schema.invoiceEvents).values(
        allEventIds.map((eid) => ({
          invoiceId: inv.id,
          eventId: eid,
        })),
      );
    }

    return {
      invoiceId: inv.id,
      invoiceNumber,
      status: "created" as const,
    };
  });

  return {
    sellerId,
    buyerId,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    status: result.status,
    totalMinor,
    groupCount: groups.length,
    smallAmountExemptionApplied: exemptionApplied,
  };
}

/** Aggregate all (seller, buyer) buckets that had events in the JST month. */
export async function aggregatePeriod(
  year: number,
  month1based: number,
): Promise<PeriodAggregationResult> {
  const bounds = jstMonthBounds(year, month1based);
  const pairs = await listSellerBuyerPairsInPeriod(bounds);
  const buckets: BucketResult[] = [];
  for (const { sellerId, buyerId } of pairs) {
    buckets.push(await aggregateOneBucket(sellerId, buyerId, bounds));
  }
  return {
    periodMonth: bounds.periodMonth,
    bucketsConsidered: pairs.length,
    buckets,
  };
}

/** Last calendar month in JST. */
export function previousJstMonth(now = new Date()): { year: number; month1based: number } {
  // Convert "now" to JST calendar Y/M
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let y = jstNow.getUTCFullYear();
  let m = jstNow.getUTCMonth(); // 0..11, this is current month0; previous is m-1+1
  if (m === 0) {
    return { year: y - 1, month1based: 12 };
  }
  return { year: y, month1based: m };
}

export type { TaxRateGroup };
