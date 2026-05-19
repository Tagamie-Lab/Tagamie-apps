import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { jstMonthBounds } from "@/lib/aggregation/queries";
import type { CanonicalInvoice, CanonicalInvoiceLineItem } from "./canonical";

/**
 * Assemble a CanonicalInvoice from an invoice row + its seller, buyer,
 * tax_lines, and the linked settle_events (via invoice_events M:N).
 */
export async function loadCanonicalInvoice(
  invoiceId: string,
): Promise<CanonicalInvoice | null> {
  const inv = await db.query.invoices.findFirst({
    where: eq(schema.invoices.id, invoiceId),
  });
  if (!inv) return null;

  const [seller, buyer, taxLines, eventLinks] = await Promise.all([
    db.query.sellers.findFirst({ where: eq(schema.sellers.id, inv.sellerId) }),
    db.query.buyers.findFirst({ where: eq(schema.buyers.id, inv.buyerId) }),
    db.query.invoiceTaxLines.findMany({
      where: eq(schema.invoiceTaxLines.invoiceId, invoiceId),
      orderBy: (t, { asc }) => [asc(t.taxRateBps)],
    }),
    db.query.invoiceEvents.findMany({
      where: eq(schema.invoiceEvents.invoiceId, invoiceId),
    }),
  ]);

  if (!seller || !buyer) {
    throw new Error(`invoice ${invoiceId} references missing seller/buyer`);
  }

  const eventIds = eventLinks.map((l) => l.eventId);
  const events: CanonicalInvoiceLineItem[] =
    eventIds.length === 0
      ? []
      : (
          await db
            .select({
              occurredAt: schema.settleEvents.occurredAt,
              amountMinor: schema.settleEvents.amountMinor,
              txHash: schema.settleEvents.txHash,
              chain: schema.settleEvents.chain,
            })
            .from(schema.settleEvents)
            .where(inArray(schema.settleEvents.id, eventIds))
            .orderBy(asc(schema.settleEvents.occurredAt))
        ).map((e) => ({
          occurredAt: e.occurredAt,
          amountMinor: e.amountMinor,
          txHash: e.txHash,
          chain: e.chain,
        }));

  const [yStr, mStr] = inv.periodMonth.split("-");
  const bounds = jstMonthBounds(Number(yStr), Number(mStr));
  // bounds.endUtc is exclusive next-month-00:00 JST in UTC instant; subtract 1ms for inclusive end.
  const periodTo = new Date(bounds.endUtc.getTime() - 1);

  return {
    invoiceNumber: inv.invoiceNumber,
    periodFrom: bounds.startUtc,
    periodTo,
    periodMonth: inv.periodMonth,
    asset: inv.asset,
    status: inv.status,
    smallAmountExemptionApplied: inv.smallAmountExemptionApplied,
    totalMinor: inv.totalMinor,
    subtotalMinor: inv.subtotalMinor,
    taxMinor: inv.taxMinor,
    seller: {
      displayName: seller.displayName,
      legalName: seller.legalName,
      taxNumber: seller.taxNumber,
      countryCode: "JP",
    },
    buyer: {
      legalName: buyer.legalName,
      walletAddress: buyer.walletAddress,
      taxNumber: buyer.taxNumber,
      countryCode: "JP",
    },
    taxLines: taxLines.map((l) => ({
      taxRateBps: l.taxRateBps,
      subtotalMinor: l.subtotalMinor,
      taxMinor: l.taxMinor,
      eventCount: l.eventCount,
    })),
    lineItems: events,
  };
}
