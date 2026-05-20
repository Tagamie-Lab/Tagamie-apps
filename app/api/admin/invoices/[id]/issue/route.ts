import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { loadCanonicalInvoice } from "@/lib/invoice/load";
import { renderInvoicePdf } from "@/lib/invoice/render-pdf";
import {
  invoicePdfObjectPath,
  uploadInvoicePdf,
} from "@/lib/storage/supabase";
import { saveLocalDevPdf } from "@/lib/storage/local-dev";

export const runtime = "nodejs";
// PDF rendering with embedded ~9MB of CJK font files is well over the default Edge timeout.
// Pin to Node runtime so fs and large buffers work.

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Issue (or re-issue) the PDF for an invoice.
 * - Loads CanonicalInvoice from DB
 * - Renders PDF (Buffer)
 * - SHA-256 hash for 電帳法 真実性要件
 * - Uploads to Supabase Storage (private bucket)
 * - Updates invoices: pdf_url, pdf_hash, status=issued, issued_at
 *
 * Path X (2026-05-20 simplification): NFT mint / IPFS pin / EIP-712 sig は撤回。
 * 適格請求書 PDF + SHA-256 hash + Supabase Storage の最小構成で運用。
 *
 * Idempotent on Storage (upsert=true).
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  try {
    const invoice = await loadCanonicalInvoice(id);
    if (!invoice) {
      return Response.json({ error: "invoice_not_found" }, { status: 404 });
    }
    if (invoice.status === "voided") {
      return Response.json({ error: "invoice_voided" }, { status: 409 });
    }
    if (invoice.lineItems.length === 0) {
      return Response.json({ error: "no_line_items" }, { status: 422 });
    }

    const pdf = await renderInvoicePdf(invoice);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");

    const localPath = await saveLocalDevPdf(invoice.invoiceNumber, pdf);

    const row = await db.query.invoices.findFirst({
      where: eq(schema.invoices.id, id),
      columns: { sellerId: true },
    });
    if (!row) {
      return Response.json({ error: "invoice_not_found" }, { status: 404 });
    }

    const objectPath = invoicePdfObjectPath({
      sellerId: row.sellerId,
      periodMonth: invoice.periodMonth,
      invoiceNumber: invoice.invoiceNumber,
    });
    await uploadInvoicePdf(objectPath, pdf);

    const issuedAt = new Date();
    await db
      .update(schema.invoices)
      .set({
        pdfUrl: objectPath,
        pdfHash,
        status: "issued",
        issuedAt,
      })
      .where(eq(schema.invoices.id, id));

    return Response.json(
      {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        pdfHash,
        pdfUrl: objectPath,
        localPath,
        issuedAt: issuedAt.toISOString(),
        byteLength: pdf.length,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("[issue PDF] failed", { invoiceId: id, error: e });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "issue_failed", message },
      { status: 500 },
    );
  }
}
