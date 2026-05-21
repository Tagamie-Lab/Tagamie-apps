// Assemble a TrustSignalPayload for a freshly-issued invoice (#5 of 3-layer
// loop closure, knowledge/cross-layer-context.md §11).
//
// Returns null when the trust signal should NOT be emitted, e.g.:
//   - invoice has no linked settle_events
//   - none of the linked events carry a CrossLayerContext
//   - none of those contexts originated from a Discovery layer we know how
//     to notify (currently only "paylog")
// In all such cases the caller silently skips — invoice issue still succeeds.

import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { TrustSignalPayload } from "./notify";

export interface BuildTrustSignalArgs {
  invoiceId: string;
  invoiceNumber: string;
  invoicePdfHash: string | null;
  periodMonth: string;
  totalMinor: bigint;
  asset: "JPYC" | "USDC";
  sellerId: string;
  buyerId: string;
}

interface SettleEventContext {
  source?: {
    discovery_layer?: unknown;
    discovered_at?: unknown;
  };
}

function extractContext(rawPayload: unknown): SettleEventContext | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const ctx = (rawPayload as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return null;
  return ctx as SettleEventContext;
}

export async function buildTrustSignal(
  args: BuildTrustSignalArgs,
): Promise<TrustSignalPayload | null> {
  if (!args.invoicePdfHash) return null;

  const links = await db
    .select({ eventId: schema.invoiceEvents.eventId })
    .from(schema.invoiceEvents)
    .where(eq(schema.invoiceEvents.invoiceId, args.invoiceId));
  if (links.length === 0) return null;

  const events = await db
    .select({ rawPayload: schema.settleEvents.rawPayload })
    .from(schema.settleEvents)
    .where(inArray(schema.settleEvents.id, links.map((l) => l.eventId)));

  let discoveredAt: string | undefined;
  let foundPaylogOrigin = false;
  for (const e of events) {
    const ctx = extractContext(e.rawPayload);
    if (!ctx?.source) continue;
    if (ctx.source.discovery_layer === "paylog") {
      foundPaylogOrigin = true;
      if (typeof ctx.source.discovered_at === "string") {
        discoveredAt = ctx.source.discovered_at;
      }
      break;
    }
  }
  if (!foundPaylogOrigin) return null;

  const [seller, buyer] = await Promise.all([
    db.query.sellers.findFirst({
      where: eq(schema.sellers.id, args.sellerId),
      columns: { payToAddress: true },
    }),
    db.query.buyers.findFirst({
      where: eq(schema.buyers.id, args.buyerId),
      columns: { walletAddress: true },
    }),
  ]);
  if (!seller || !buyer) return null;

  // JPY 1:1 conversion only for JPYC. Other assets: omit total_jpy.
  let totalJpy: number | undefined;
  if (args.asset === "JPYC") {
    totalJpy = Number(args.totalMinor / 10n ** 18n);
  }

  // periodMonth is "YYYY-MM-01" in DB; trim to "YYYY-MM" for signal payload.
  const periodIso = args.periodMonth.slice(0, 7);

  return {
    version: "1.0",
    event: "invoice_issued",
    emitted_at: new Date().toISOString(),
    pair: {
      seller_wallet: seller.payToAddress.toLowerCase(),
      buyer_wallet: buyer.walletAddress.toLowerCase(),
    },
    period: periodIso,
    totals: {
      total_jpy: totalJpy,
      settle_event_count: events.length,
    },
    context_origin: {
      discovery_layer: "paylog",
      discovered_at: discoveredAt,
    },
    invoice_pdf_hash: args.invoicePdfHash,
    invoice_number: args.invoiceNumber,
  };
}
