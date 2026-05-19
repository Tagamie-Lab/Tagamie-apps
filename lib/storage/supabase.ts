import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (service role).
 * Used to upload PDFs and mint signed download URLs.
 *
 * Setup outside of code (run once per environment):
 *   - Create a Storage bucket named `invoices` (private).
 *   - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */

const BUCKET = "invoices";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  // URL is non-secret and follows Supabase's NEXT_PUBLIC_ convention; accept either name.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function invoicePdfObjectPath(args: {
  sellerId: string;
  periodMonth: string;
  invoiceNumber: string;
}): string {
  // e.g. seller/<uuid>/2026-05/INV-2026-05-0001.pdf
  return `seller/${args.sellerId}/${args.periodMonth.slice(0, 7)}/${args.invoiceNumber}.pdf`;
}

export async function uploadInvoicePdf(
  objectPath: string,
  pdf: Buffer,
): Promise<{ path: string }> {
  const client = getClient();
  const { error, data } = await client.storage
    .from(BUCKET)
    .upload(objectPath, pdf, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "no-cache",
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return { path: data.path };
}

export async function signInvoicePdfUrl(objectPath: string): Promise<string> {
  const client = getClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`signed url failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
