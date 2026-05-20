import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Dev-only: seed a realistic batch of JPYC micropayments for one (seller, buyer)
 * pair across the chosen JST month, so the W3 PDF demonstrates accumulation.
 *
 * - Reuses the first existing seller (assumed already seeded for W1/W2 tests).
 * - Creates a dedicated demo buyer 「株式会社マイクロペイ買主」 (idempotent by wallet).
 * - Inserts ~80 settle_events with a long-tail amount distribution.
 * - Idempotent via unique(chain, tx_hash) — deterministic tx hashes from a counter.
 *
 * POST body (optional): { "year": 2026, "month": 5, "count": 80 }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "dev_only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    year?: number;
    month?: number;
    count?: number;
  };
  const year = Number(body.year) || 2026;
  const month = Number(body.month) || 5;
  const count = Math.min(Math.max(Number(body.count) || 80, 1), 500);

  const seller = await db.query.sellers.findFirst();
  if (!seller) {
    return Response.json(
      { error: "no_seller", hint: "seed a seller via your W1/W2 setup first" },
      { status: 422 },
    );
  }

  const DEMO_WALLET = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
  let buyer = await db.query.buyers.findFirst({
    where: eq(schema.buyers.walletAddress, DEMO_WALLET),
  });
  if (!buyer) {
    const [created] = await db
      .insert(schema.buyers)
      .values({
        walletAddress: DEMO_WALLET,
        legalName: "株式会社マイクロペイ買主",
        taxNumber: "T9876543210987",
        smallAmountExemptionEligible: true,
        email: "ap@micropay-demo.example",
      })
      .returning();
    buyer = created;
  }

  const ONE_JPYC = 10n ** 18n;

  // Long-tail micropayment distribution: many small txs, a few larger ones.
  // Bucketed in yen (whole-JPYC) for readability.
  function pickAmountYen(rand: number): number {
    if (rand < 0.6) return 1 + Math.floor(Math.random() * 10); // ¥1-¥10
    if (rand < 0.85) return 10 + Math.floor(Math.random() * 90); // ¥10-¥100
    if (rand < 0.97) return 100 + Math.floor(Math.random() * 400); // ¥100-¥500
    return 1000 + Math.floor(Math.random() * 2000); // ¥1,000-¥3,000
  }

  // Spread occurredAt across the JST month with bias toward business hours.
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
        .update(`micropay-seed-${year}-${month}-${i}-${DEMO_WALLET}`)
        .digest("hex");
    // Random instant within the month, but bias to 09:00-22:00 JST.
    const dayFraction = Math.random();
    const hour = 9 + Math.floor(Math.random() * 13); // 9..21
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
      taxRateBps: seller.defaultTaxRateBps,
      chain: "polygon",
      txHash,
      blockNumber: 50_000_000n + BigInt(i),
      rawPayload: { seed: "micropay", index: i, yen },
      resource: "/api/premium/micropay",
      occurredAt: occurredAtJst,
    });
  }

  // onConflictDoNothing: re-running this endpoint won't duplicate.
  const inserted = await db
    .insert(schema.settleEvents)
    .values(values)
    .onConflictDoNothing({
      target: [schema.settleEvents.chain, schema.settleEvents.txHash],
    })
    .returning({ id: schema.settleEvents.id });

  return Response.json({
    sellerId: seller.id,
    buyerId: buyer.id,
    buyerName: buyer.legalName,
    requested: count,
    insertedNew: inserted.length,
    skippedDuplicate: count - inserted.length,
    period: `${year}-${String(month).padStart(2, "0")}`,
    nextSteps: [
      "Run aggregation for this period in the admin UI",
      "Find the invoice for buyer 株式会社マイクロペイ買主",
      "Click PDF 発行 to see the accumulated micropayment invoice",
    ],
  });
}
