import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

const T_NUMBER_RE = /^T\d{13}$/;

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(200),
  taxNumber: z
    .string()
    .trim()
    .regex(T_NUMBER_RE, "T 番号は T + 13 桁の数字"),
  transactionAgentName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  businessAddress: z.string().trim().max(300).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
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

  // Reject if this wallet is already registered as a seller
  const existing = await db
    .select({ id: schema.sellers.id })
    .from(schema.sellers)
    .where(eq(schema.sellers.payToAddress, address))
    .limit(1);
  if (existing.length > 0) {
    return Response.json(
      { error: "wallet_already_registered_as_seller" },
      { status: 409 },
    );
  }

  const dup = await db
    .select({ id: schema.sellers.id })
    .from(schema.sellers)
    .where(eq(schema.sellers.taxNumber, parsed.data.taxNumber))
    .limit(1);
  if (dup.length > 0) {
    return Response.json(
      { error: "tax_number_already_registered" },
      { status: 409 },
    );
  }

  const sellerRows = await db
    .insert(schema.sellers)
    .values({
      displayName: parsed.data.displayName,
      legalName: parsed.data.legalName,
      taxNumber: parsed.data.taxNumber,
      payToAddress: address,
      email: parsed.data.email || null,
      transactionAgentName: parsed.data.transactionAgentName || null,
      businessAddress: parsed.data.businessAddress || null,
      industry: parsed.data.industry || null,
    })
    .returning({ id: schema.sellers.id });
  const seller = sellerRows[0];
  if (!seller) {
    return Response.json({ error: "insert_failed" }, { status: 500 });
  }

  await db.insert(schema.wallets).values({
    address,
    ownerType: "seller",
    sellerId: seller.id,
    label: "primary",
  });

  await db.insert(schema.termsAcceptance).values({
    walletAddress: address,
    termsVersion: parsed.data.termsVersion,
    privacyVersion: parsed.data.privacyVersion,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return Response.json({ ok: true, sellerId: seller.id });
}
