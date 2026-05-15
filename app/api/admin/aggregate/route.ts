import { NextRequest } from "next/server";
import { aggregatePeriod } from "@/lib/aggregation/aggregate";

/**
 * Synchronous aggregation trigger for the admin UI.
 * Runs aggregation in-process and returns the result.
 * The Inngest cron handles the scheduled monthly run separately.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    year?: unknown;
    month?: unknown;
  };
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return Response.json({ error: "invalid_year" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return Response.json({ error: "invalid_month" }, { status: 400 });
  }

  const result = await aggregatePeriod(year, month);
  return Response.json(
    {
      periodMonth: result.periodMonth,
      bucketsConsidered: result.bucketsConsidered,
      buckets: result.buckets.map((b) => ({
        sellerId: b.sellerId,
        buyerId: b.buyerId,
        invoiceId: b.invoiceId,
        invoiceNumber: b.invoiceNumber,
        status: b.status,
        totalMinor: b.totalMinor.toString(),
        groupCount: b.groupCount,
        smallAmountExemptionApplied: b.smallAmountExemptionApplied,
      })),
    },
    { status: 200 },
  );
}
