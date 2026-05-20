import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

const bodySchema = z.object({
  businessName: z.string().trim().max(200).optional().or(z.literal("")),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  termsVersion: z.string().min(1),
  privacyVersion: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const address = session.address.toLowerCase();

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

  const existing = await db
    .select({ id: schema.buyers.id })
    .from(schema.buyers)
    .where(eq(schema.buyers.walletAddress, address))
    .limit(1);
  if (existing.length > 0) {
    return Response.json(
      { error: "wallet_already_registered_as_buyer" },
      { status: 409 },
    );
  }

  const buyerRows = await db
    .insert(schema.buyers)
    .values({
      walletAddress: address,
      legalName: parsed.data.legalName || null,
      businessName: parsed.data.businessName || null,
      email: parsed.data.email || null,
    })
    .returning({ id: schema.buyers.id });
  const buyer = buyerRows[0];
  if (!buyer) {
    return Response.json({ error: "insert_failed" }, { status: 500 });
  }

  await db.insert(schema.wallets).values({
    address,
    ownerType: "buyer",
    buyerId: buyer.id,
    label: "primary",
  });

  await db.insert(schema.termsAcceptance).values({
    walletAddress: address,
    termsVersion: parsed.data.termsVersion,
    privacyVersion: parsed.data.privacyVersion,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return Response.json({ ok: true, buyerId: buyer.id });
}
