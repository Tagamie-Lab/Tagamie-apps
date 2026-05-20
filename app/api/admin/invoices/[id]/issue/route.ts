import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import { db, schema } from "@/lib/db";
import { loadCanonicalInvoice } from "@/lib/invoice/load";
import { renderInvoicePdf } from "@/lib/invoice/render-pdf";
import {
  pdfHashHex,
  signInvoiceTypedData,
  invoiceTypedDataJson,
  type InvoiceTypedDataMessage,
} from "@/lib/invoice/eip712";
import {
  invoicePdfObjectPath,
  uploadInvoicePdf,
} from "@/lib/storage/supabase";
import { pinFile, pinJson } from "@/lib/storage/pinata";
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
 * Idempotent on Storage (upsert=true). Re-issuing overwrites the file and
 * updates pdf_hash to the new render. status transitions draft → issued only
 * once; subsequent re-issues keep status=issued and refresh issued_at.
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

    // Local dev convenience: dump to ./tmp/pdfs/ before remote upload so the
    // file is available for inspection even if Supabase Storage misbehaves.
    const localPath = await saveLocalDevPdf(invoice.invoiceNumber, pdf);

    // Need sellerId for the object path; load it from the invoices row.
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

    // --- W-2: EIP-712 signature + IPFS pin -----------------------------------
    // Three-layer canonical (tagamie-platform-spec §3.4):
    //   1. EIP-712 signed metadata (cryptographic 真実性, this block)
    //   2. NFT mint (W-3, references ipfs:// of metadata.json)
    //   3. PDF (法定 6 要件, pinned to IPFS for NFT-linked download)
    //
    // Network failures here are tolerated (issuance still succeeds with the
    // Supabase upload above); IPFS/EIP-712 fields are filled best-effort.
    const issuedAt = new Date();
    let ipfsPdfCid: string | null = null;
    let ipfsMetadataCid: string | null = null;
    let eip712Signature: `0x${string}` | null = null;
    let eip712MessageHash: `0x${string}` | null = null;

    try {
      ipfsPdfCid = (
        await pinFile(pdf, {
          name: `${invoice.invoiceNumber}.pdf`,
          contentType: "application/pdf",
          keyvalues: {
            invoiceId: id,
            invoiceNumber: invoice.invoiceNumber,
            periodMonth: invoice.periodMonth,
            sellerTaxNumber: invoice.seller.taxNumber,
          },
        })
      ).cid;
    } catch (e) {
      console.warn("[issue PDF] IPFS PDF pin failed (continuing)", e);
    }

    try {
      const buyerAddr = getAddress(invoice.buyer.walletAddress as `0x${string}`);
      const sellerAddr = getAddress(
        (await db.query.sellers.findFirst({
          where: eq(schema.sellers.id, row.sellerId),
          columns: { payToAddress: true },
        }))!.payToAddress as `0x${string}`,
      );
      const eip712Message: InvoiceTypedDataMessage = {
        invoiceNumber: invoice.invoiceNumber,
        periodMonth: invoice.periodMonth,
        sellerLegalName: invoice.seller.legalName,
        sellerTaxNumber: invoice.seller.taxNumber,
        sellerAddress: sellerAddr,
        buyerAddress: buyerAddr,
        asset: invoice.asset,
        totalMinor: invoice.totalMinor,
        subtotalMinor: invoice.subtotalMinor,
        taxMinor: invoice.taxMinor,
        smallAmountExemptionApplied: invoice.smallAmountExemptionApplied,
        pdfHash: pdfHashHex(pdfHash),
        issuedAt: BigInt(Math.floor(issuedAt.getTime() / 1000)),
      };
      const { signature, messageHash } =
        await signInvoiceTypedData(eip712Message);
      eip712Signature = signature;
      eip712MessageHash = messageHash;

      try {
        const metadataJson = invoiceTypedDataJson(eip712Message, signature);
        if (ipfsPdfCid) {
          (metadataJson as Record<string, unknown>).pdfIpfs = `ipfs://${ipfsPdfCid}`;
        }
        ipfsMetadataCid = (
          await pinJson(metadataJson, {
            name: `${invoice.invoiceNumber}.metadata.json`,
            keyvalues: {
              invoiceId: id,
              invoiceNumber: invoice.invoiceNumber,
            },
          })
        ).cid;
      } catch (e) {
        console.warn("[issue PDF] IPFS metadata pin failed (continuing)", e);
      }
    } catch (e) {
      console.warn("[issue PDF] EIP-712 signing failed (continuing)", e);
    }

    await db
      .update(schema.invoices)
      .set({
        pdfUrl: objectPath,
        pdfHash,
        status: "issued",
        issuedAt,
        ipfsPdfCid,
        ipfsMetadataCid,
        eip712Signature,
        eip712MessageHash,
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
        ipfsPdfCid,
        ipfsMetadataCid,
        eip712Signature,
        eip712MessageHash,
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
