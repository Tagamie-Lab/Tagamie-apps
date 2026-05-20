import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { signInvoicePdfUrl } from "@/lib/storage/supabase";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * SIWE-protected PDF download for sellers.
 * - Requires authenticated session.
 * - Verifies the invoice belongs to a seller wallet linked to the session.
 * - Redirects to a fresh Supabase signed URL.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const address = session.address.toLowerCase();
  const { id } = await ctx.params;

  const inv = await db.query.invoices.findFirst({
    where: eq(schema.invoices.id, id),
    columns: { pdfUrl: true, status: true, sellerId: true },
  });
  if (!inv) {
    return Response.json({ error: "invoice_not_found" }, { status: 404 });
  }
  if (!inv.pdfUrl) {
    return Response.json({ error: "pdf_not_issued" }, { status: 404 });
  }

  const sellerByPrimary = await db
    .select({ id: schema.sellers.id })
    .from(schema.sellers)
    .where(eq(schema.sellers.payToAddress, address))
    .limit(1);

  let sellerId: string | null = sellerByPrimary[0]?.id ?? null;
  if (!sellerId) {
    const link = await db
      .select({ sellerId: schema.wallets.sellerId })
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.address, address),
          eq(schema.wallets.ownerType, "seller"),
        ),
      )
      .limit(1);
    sellerId = link[0]?.sellerId ?? null;
  }

  if (!sellerId || sellerId !== inv.sellerId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const signed = await signInvoicePdfUrl(inv.pdfUrl);
  return Response.redirect(signed, 302);
}
