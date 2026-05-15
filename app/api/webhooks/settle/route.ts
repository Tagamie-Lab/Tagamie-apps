import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

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
});

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

export async function POST(req: NextRequest) {
  const expected = process.env.TAGAMIE_WEBHOOK_SECRET;
  if (!expected) return json(500, { error: "webhook_secret_not_configured" });
  if (req.headers.get("x-webhook-secret") !== expected) {
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
      taxRateBps: parsed.taxRateBps ?? 1000,
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
