import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { signInvoicePdfUrl } from "@/lib/storage/supabase";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * SIWE-protected PDF download for buyers.
 * - Requires authenticated session.
 * - Verifies the invoice belongs to a buyer wallet linked to the session.
 *   (primary buyer.walletAddress OR a row in wallets table with owner_type='buyer')
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
    columns: { pdfUrl: true, status: true, buyerId: true },
  });
  if (!inv) {
    return Response.json({ error: "invoice_not_found" }, { status: 404 });
  }
  if (!inv.pdfUrl) {
    return Response.json({ error: "pdf_not_issued" }, { status: 404 });
  }

  const buyerByPrimary = await db
    .select({ id: schema.buyers.id })
    .from(schema.buyers)
    .where(eq(schema.buyers.walletAddress, address))
    .limit(1);

  let buyerId: string | null = buyerByPrimary[0]?.id ?? null;
  if (!buyerId) {
    const link = await db
      .select({ buyerId: schema.wallets.buyerId })
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.address, address),
          eq(schema.wallets.ownerType, "buyer"),
        ),
      )
      .limit(1);
    buyerId = link[0]?.buyerId ?? null;
  }

  if (!buyerId || buyerId !== inv.buyerId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const signed = await signInvoicePdfUrl(inv.pdfUrl);
  return Response.redirect(signed, 302);
}
