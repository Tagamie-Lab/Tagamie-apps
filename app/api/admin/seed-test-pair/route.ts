import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  sellerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  count: z.number().int().min(1).max(200).optional(),
  year: z.number().int().min(2024).max(2030).optional(),
  month: z.number().int().min(1).max(12).optional(),
  chain: z
    .enum(["polygon", "base", "ethereum", "kaia", "polygonAmoy", "kaiaKairos"])
    .optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
});

/**
 * Dev-only: seed N settle_events between a specific registered (seller, buyer)
 * pair so the W-1 / W-2 dashboards can be verified end-to-end with real
 * registered wallets (not the hardcoded demo buyer used by /seed-micropayments).
 *
 * POST body:
 *   { sellerAddress: "0x...", buyerAddress: "0x...", count?: 20, year?: 2026,
 *     month?: 5, chain?: "polygonAmoy", taxRateBps?: 1000 }
 *
 * Both addresses must already be registered via /seller/register and
 * /buyer/register respectively.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "dev_only" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const args = parsed.data;
  const sellerAddress = args.sellerAddress.toLowerCase();
  const buyerAddress = args.buyerAddress.toLowerCase();
  const count = args.count ?? 20;
  const year = args.year ?? 2026;
  const month = args.month ?? 5;
  const chain = args.chain ?? "polygonAmoy";

  const seller = await db.query.sellers.findFirst({
    where: eq(schema.sellers.payToAddress, sellerAddress),
  });
  if (!seller) {
    return Response.json(
      {
        error: "seller_not_registered",
        sellerAddress,
        hint: "Register via /seller/register first",
      },
      { status: 404 },
    );
  }

  const taxRateBps = args.taxRateBps ?? seller.defaultTaxRateBps;

  const buyer = await db.query.buyers.findFirst({
    where: eq(schema.buyers.walletAddress, buyerAddress),
  });
  if (!buyer) {
    return Response.json(
      {
        error: "buyer_not_registered",
        buyerAddress,
        hint: "Register via /buyer/register first",
      },
      { status: 404 },
    );
  }

  const ONE_JPYC = 10n ** 18n;

  // Long-tail micropayment distribution.
  function pickAmountYen(rand: number): number {
    if (rand < 0.6) return 1 + Math.floor(Math.random() * 10);
    if (rand < 0.85) return 10 + Math.floor(Math.random() * 90);
    if (rand < 0.97) return 100 + Math.floor(Math.random() * 400);
    return 1000 + Math.floor(Math.random() * 2000);
  }

  const monthStartJst = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const monthEndJst = new Date(Date.UTC(year, month, 1, -9, 0, 0));
  const spanMs = monthEndJst.getTime() - monthStartJst.getTime();

  const values: (typeof schema.settleEvents.$inferInsert)[] = [];
  for (let i = 0; i < count; i++) {
    const yen = pickAmountYen(Math.random());
    const amountMinor = BigInt(yen) * ONE_JPYC;
    const txHash =
      "0x" +
      createHash("sha256")
        .update(
          `test-pair-${year}-${month}-${i}-${sellerAddress}-${buyerAddress}-${chain}`,
        )
        .digest("hex");
    const dayFraction = Math.random();
    const hour = 9 + Math.floor(Math.random() * 13);
    const minute = Math.floor(Math.random() * 60);
    const dayInMonth = Math.floor((spanMs / (24 * 3600 * 1000)) * dayFraction);
    const occurredAtJst = new Date(
      Date.UTC(year, month - 1, 1 + dayInMonth, hour - 9, minute, 0),
    );

    values.push({
      sellerId: seller.id,
      buyerId: buyer.id,
      amountMinor,
      asset: "JPYC",
      taxRateBps,
      chain,
      txHash,
      blockNumber: 60_000_000n + BigInt(i),
      rawPayload: { seed: "test-pair", index: i, yen, chain },
      resource: "/api/test/pair",
      occurredAt: occurredAtJst,
    });
  }

  const inserted = await db
    .insert(schema.settleEvents)
    .values(values)
    .onConflictDoNothing({
      target: [schema.settleEvents.chain, schema.settleEvents.txHash],
    })
    .returning({ id: schema.settleEvents.id });

  return Response.json({
    sellerId: seller.id,
    sellerDisplayName: seller.displayName,
    buyerId: buyer.id,
    buyerLabel: buyer.businessName ?? buyer.legalName ?? buyerAddress,
    requested: count,
    insertedNew: inserted.length,
    skippedDuplicate: count - inserted.length,
    period: `${year}-${String(month).padStart(2, "0")}`,
    chain,
    nextSteps: [
      "POST /api/admin/aggregate (or click 集計実行 in /admin/invoices) to materialise the invoice",
      "View on /seller/dashboard and /buyer/dashboard",
    ],
  });
}
