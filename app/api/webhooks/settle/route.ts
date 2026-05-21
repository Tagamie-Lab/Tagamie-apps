import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";

/**
 * Cross-Layer Context v1 (knowledge/cross-layer-context.md §3).
 * Validated loosely — facilitators send it opaquely, only `version` is
 * required to match. Extra fields are preserved into rawPayload so the
 * invoice load path can pull description / service name later
 * (lib/invoice/load.ts:extractTransactionDescription).
 */
const crossLayerContextSchema = z
  .object({
    version: z.literal("1.0"),
    intent: z.string().optional(),
    service: z
      .object({
        name: z.string(),
        category: z.string().optional(),
        endpoint: z.string().optional(),
        counterparty_wallet: z.string(),
      })
      .passthrough(),
    description: z.string().optional(),
    invoice_hints: z
      .object({
        tax_category: z.enum(["standard_10", "reduced_8", "exempt"]).optional(),
        receipt_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    source: z
      .object({
        discovery_layer: z.enum(["paylog", "manual", "other"]),
        discovered_at: z.string().optional(),
        trust_score_at_discovery: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chain: z.enum(["polygon", "base", "ethereum"]),
  payTo: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  payer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountMinor: z.string().regex(/^\d+$/),
  asset: z.enum(["JPYC", "USDC"]),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  blockNumber: z.string().regex(/^\d+$/).optional(),
  resource: z.string().optional(),
  occurredAt: z.string().datetime(),
  context: crossLayerContextSchema.optional(),
});

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/**
 * Constant-time secret comparison (review item #6). Matches the pattern used
 * by the Alchemy webhook so both ingest paths leak no timing information when
 * an attacker probes the shared-secret header.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const expected = process.env.TAGAMIE_WEBHOOK_SECRET;
  if (!expected) return json(500, { error: "webhook_secret_not_configured" });
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!constantTimeEqual(provided, expected)) {
    return json(401, { error: "unauthorized" });
  }

  let parsed;
  try {
    parsed = payloadSchema.parse(await req.json());
  } catch (e) {
    return json(400, { error: "invalid_payload", detail: (e as Error).message });
  }

  const seller = await db.query.sellers.findFirst({
    where: eq(schema.sellers.payToAddress, parsed.payTo.toLowerCase()),
  });
  if (!seller) return json(404, { error: "seller_not_found", payTo: parsed.payTo });

  const buyer = await db.query.buyers.findFirst({
    where: eq(schema.buyers.walletAddress, parsed.payer.toLowerCase()),
  });
  if (!buyer) return json(404, { error: "buyer_not_found", payer: parsed.payer });

  const inserted = await db
    .insert(schema.settleEvents)
    .values({
      sellerId: seller.id,
      buyerId: buyer.id,
      amountMinor: BigInt(parsed.amountMinor),
      asset: parsed.asset,
      taxRateBps: parsed.taxRateBps ?? seller.defaultTaxRateBps,
      chain: parsed.chain,
      txHash: parsed.txHash.toLowerCase(),
      blockNumber: parsed.blockNumber ? BigInt(parsed.blockNumber) : null,
      rawPayload: parsed,
      resource: parsed.resource ?? null,
      occurredAt: new Date(parsed.occurredAt),
    })
    .onConflictDoNothing({
      target: [schema.settleEvents.chain, schema.settleEvents.txHash],
    })
    .returning({ id: schema.settleEvents.id });

  if (inserted.length === 0) {
    return json(200, { duplicate: true, txHash: parsed.txHash });
  }

  // Inngest send is best-effort: DB row is the source of truth; failed events can be backfilled.
  let inngestError: string | null = null;
  try {
    await inngest.send({
      name: "tagamie/settle.received",
      data: {
        settleEventId: inserted[0].id,
        sellerId: seller.id,
        buyerId: buyer.id,
        ...parsed,
      },
    });
  } catch (e) {
    inngestError = (e as Error).message;
    console.warn("[webhooks/settle] inngest send failed:", inngestError);
  }

  return json(201, { id: inserted[0].id, ...(inngestError ? { inngestError } : {}) });
}
