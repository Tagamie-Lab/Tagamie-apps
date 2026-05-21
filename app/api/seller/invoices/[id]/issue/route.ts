import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { loadCanonicalInvoice } from "@/lib/invoice/load";
import { renderInvoicePdf } from "@/lib/invoice/render-pdf";
import {
  invoicePdfObjectPath,
  uploadInvoicePdf,
} from "@/lib/storage/supabase";
import { saveLocalDevPdf } from "@/lib/storage/local-dev";
import { buildTrustSignal } from "@/lib/trust-signal/build";
import { notifyTrustSignal } from "@/lib/trust-signal/notify";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Seller 確定ゲート: draft invoice の内容を確認の上、 確定・交付する。
 * - SIWE session 必須
 * - 自分が seller の invoice のみ操作可
 * - status="draft" のみ受理 (issued の再発行は admin route)
 *
 * 確定時点で:
 *   PDF 生成 → SHA-256 hash → Supabase Storage upload → status="issued" + issued_at
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const address = session.address.toLowerCase();
  const { id } = await ctx.params;

  try {
    const row = await db.query.invoices.findFirst({
      where: eq(schema.invoices.id, id),
      columns: { sellerId: true, buyerId: true, status: true },
    });
    if (!row) {
      return Response.json({ error: "invoice_not_found" }, { status: 404 });
    }
    if (row.status !== "draft") {
      return Response.json(
        { error: "not_draft", status: row.status },
        { status: 409 },
      );
    }

    // Verify seller ownership: session address matches seller (primary or wallets table)
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
    if (!sellerId || sellerId !== row.sellerId) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const invoice = await loadCanonicalInvoice(id);
    if (!invoice) {
      return Response.json({ error: "invoice_not_found" }, { status: 404 });
    }
    if (invoice.lineItems.length === 0) {
      return Response.json({ error: "no_line_items" }, { status: 422 });
    }

    const pdf = await renderInvoicePdf(invoice);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const localPath = await saveLocalDevPdf(invoice.invoiceNumber, pdf);

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

    // TODO (Phase 1): buyer に email 通知 (Resend integration)

    // Trust signal を Discovery 層に還元 (#5 of 3-layer loop closure,
    // knowledge/cross-layer-context.md §11). best-effort、 invoice 発行は
    // 既に成功しているので signal 失敗は warn ログのみで握る。
    // discovery_layer=paylog の context を持つ settle_event があるときだけ
    // signal が組み立てられ、 それ以外は silent skip。
    try {
      const payload = await buildTrustSignal({
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        invoicePdfHash: pdfHash,
        periodMonth: invoice.periodMonth,
        totalMinor: invoice.totalMinor,
        asset: invoice.asset,
        sellerId: row.sellerId,
        buyerId: row.buyerId,
      });
      if (payload) await notifyTrustSignal(payload);
    } catch (signalErr) {
      console.warn(
        "[seller issue PDF] trust signal build/dispatch error",
        signalErr instanceof Error ? signalErr.message : String(signalErr),
      );
    }

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
    console.error("[seller issue PDF] failed", { invoiceId: id, error: e });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "issue_failed", message },
      { status: 500 },
    );
  }
}
