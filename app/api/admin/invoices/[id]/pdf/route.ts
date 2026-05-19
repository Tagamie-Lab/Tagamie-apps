import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signInvoicePdfUrl } from "@/lib/storage/supabase";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Redirect to a fresh signed download URL for an issued invoice PDF.
 * Returns 404 if the invoice is not yet issued (pdf_url unset).
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  const inv = await db.query.invoices.findFirst({
    where: eq(schema.invoices.id, id),
    columns: { pdfUrl: true, status: true },
  });
  if (!inv) {
    return Response.json({ error: "invoice_not_found" }, { status: 404 });
  }
  if (!inv.pdfUrl) {
    return Response.json({ error: "pdf_not_issued" }, { status: 404 });
  }

  const signed = await signInvoicePdfUrl(inv.pdfUrl);
  return Response.redirect(signed, 302);
}
