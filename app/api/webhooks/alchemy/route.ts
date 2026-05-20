import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import {
  dbChainFromAlchemyNetwork,
  findJpycByContract,
  jpycByDbChain,
} from "@/lib/chains/jpyc";
import { fetchBlockTimestamp } from "@/lib/chains/block-time";

export const runtime = "nodejs";

/**
 * Direct on-chain indexer for Tagamie (W-2, Path B Phase 0-A).
 *
 * Receives Alchemy Custom Webhooks (Address Activity) and translates ERC-20
 * `Transfer(from, to, value)` events on JPYC contracts (across all supported
 * chains) into `settle_events` rows. This replaces the yen402 webhook as the
 * primary source of truth — yen402 remains as dev backup per
 * [[tagamie-platform-spec]] §8.
 *
 * Alchemy webhook setup:
 *   1. Alchemy dashboard → Webhooks → Create → "Custom Webhooks"
 *   2. URL: https://<your-domain>/api/webhooks/alchemy
 *   3. Network: Polygon Amoy (or Kaia Kairos, etc.)
 *   4. Filter: ERC-20 Transfer events where contract = JPYC contract address
 *   5. Capture the signing key → ALCHEMY_SIGNING_KEY in env
 *
 * Security: HMAC-SHA256 of raw body with shared secret per Alchemy docs.
 */

const transferActivitySchema = z.object({
  category: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  value: z.number().optional(), // human-readable amount (e.g., 12.5 JPYC)
  asset: z.string().optional(),
  rawContract: z
    .object({
      address: z.string(),
      rawValue: z.string(), // hex-encoded uint256
      decimals: z.number().optional(),
    })
    .optional(),
  log: z
    .object({
      transactionHash: z.string(),
      blockNumber: z.string().optional(),
    })
    .optional(),
  hash: z.string().optional(),
  blockNum: z.string().optional(),
});

const webhookSchema = z.object({
  webhookId: z.string().optional(),
  id: z.string().optional(),
  createdAt: z.string().optional(),
  type: z.string(),
  event: z.object({
    network: z.string().optional(),
    activity: z.array(transferActivitySchema),
  }),
});

function verifyAlchemySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.ALCHEMY_SIGNING_KEY;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : `0x${hex}`);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyAlchemySignature(raw, req.headers.get("x-alchemy-signature"))) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const body = webhookSchema.safeParse(parsed);
  if (!body.success) {
    return Response.json(
      { error: "invalid_body", details: body.error.flatten() },
      { status: 400 },
    );
  }

  let inserted = 0;
  let skipped = 0;

  // Prefer Alchemy's `event.network` to pin the chain; the contract address
  // alone can collide across testnets when the same env value is set in
  // multiple chain configs.
  const network = body.data.event.network ?? null;
  const chainFromNetwork = network
    ? dbChainFromAlchemyNetwork(network)
    : null;

  // Cache block→timestamp lookups within this webhook batch. Multiple transfers
  // can land in the same block; resolving once per block keeps RPC pressure low.
  const blockTimestampCache = new Map<string, Date | null>();
  async function resolveBlockTimestamp(
    chain: string,
    blockNumber: bigint,
  ): Promise<Date | null> {
    const key = `${chain}:${blockNumber.toString()}`;
    if (blockTimestampCache.has(key)) {
      return blockTimestampCache.get(key) ?? null;
    }
    const ts = await fetchBlockTimestamp(
      chain as Parameters<typeof fetchBlockTimestamp>[0],
      blockNumber,
    );
    blockTimestampCache.set(key, ts);
    return ts;
  }

  for (const activity of body.data.event.activity) {
    if (activity.category !== "token") continue;
    const contractAddr = activity.rawContract?.address;
    if (!contractAddr) continue;

    // Resolve the JPYC config: prefer (network → expected contract) over
    // (contract → first match) so address collisions across testnets don't
    // misattribute the chain.
    let chainCfg = null;
    if (chainFromNetwork) {
      const expected = jpycByDbChain(chainFromNetwork);
      if (
        expected?.jpycAddress &&
        expected.jpycAddress.toLowerCase() === contractAddr.toLowerCase()
      ) {
        chainCfg = expected;
      }
    }
    if (!chainCfg) {
      chainCfg = findJpycByContract(contractAddr);
    }
    if (!chainCfg) {
      // Not a JPYC contract we recognise — ignore.
      skipped++;
      continue;
    }

    const txHash =
      activity.log?.transactionHash ?? activity.hash ?? null;
    if (!txHash) {
      skipped++;
      continue;
    }

    const fromAddr = activity.fromAddress.toLowerCase();
    const toAddr = activity.toAddress.toLowerCase();

    // Match seller by payToAddress (= recipient of JPYC)
    const seller = await db.query.sellers.findFirst({
      where: eq(schema.sellers.payToAddress, toAddr),
    });
    if (!seller) {
      skipped++;
      continue;
    }

    // Match buyer by walletAddress (= sender of JPYC)
    const buyer = await db.query.buyers.findFirst({
      where: eq(schema.buyers.walletAddress, fromAddr),
    });
    if (!buyer) {
      // Registered seller but unregistered buyer — record skipped for now.
      // Phase 1 will surface "pending counterparty" UI for this case.
      skipped++;
      continue;
    }

    const amountMinor = activity.rawContract?.rawValue
      ? hexToBigInt(activity.rawContract.rawValue)
      : 0n;
    if (amountMinor === 0n) {
      skipped++;
      continue;
    }

    const blockNumber = activity.log?.blockNumber
      ? hexToBigInt(activity.log.blockNumber)
      : activity.blockNum
        ? hexToBigInt(activity.blockNum)
        : null;

    // Resolve block timestamp via RPC so `occurredAt` reflects on-chain time,
    // not webhook delivery time. A late webhook for a 月末23:59 tx would
    // otherwise bucket into the *next* month's invoice (review item #1).
    const blockTimestamp =
      blockNumber !== null
        ? await resolveBlockTimestamp(chainCfg.dbChain, blockNumber)
        : null;
    if (blockTimestamp === null) {
      console.warn(
        `[alchemy webhook] missing block timestamp tx=${txHash} chain=${chainCfg.dbChain} block=${blockNumber?.toString() ?? "?"} — falling back to received-time; backfill required`,
      );
    }
    // Fall back to `now()` only when RPC could not resolve. The
    // `block_timestamp` column stays null in that case and can be backfilled
    // by a maintenance job before month-close.
    const occurredAt = blockTimestamp ?? new Date();

    try {
      const result = await db
        .insert(schema.settleEvents)
        .values({
          sellerId: seller.id,
          buyerId: buyer.id,
          amountMinor,
          asset: "JPYC",
          taxRateBps: seller.defaultTaxRateBps,
          chain: chainCfg.dbChain,
          txHash,
          blockNumber,
          blockTimestamp,
          rawPayload: activity as unknown as Record<string, unknown>,
          resource: null,
          occurredAt,
        })
        .onConflictDoNothing({
          target: [schema.settleEvents.chain, schema.settleEvents.txHash],
        })
        .returning({ id: schema.settleEvents.id });

      if (result.length > 0) {
        inserted++;
        // Best-effort Inngest emit so downstream listeners (notifications etc.)
        // can subscribe later.
        inngest
          .send({
            name: "tagamie/settle.recorded",
            data: {
              settleEventId: result[0].id,
              sellerId: seller.id,
              buyerId: buyer.id,
              chain: chainCfg.dbChain,
              txHash,
            },
          })
          .catch(() => {});
      } else {
        skipped++;
      }
    } catch (e) {
      console.error("[alchemy webhook] insert failed", e, { txHash });
      skipped++;
    }
  }

  return Response.json({ ok: true, inserted, skipped });
}
