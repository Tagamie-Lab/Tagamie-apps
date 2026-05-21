// Best-effort trust signal notification to Discovery layer (#5 of 3-layer
// loop closure, knowledge/cross-layer-context.md §11).
//
// Mirrors yen402-jpyc's notifyTagamie pattern: fire-and-forget POST, log
// failures, never block the caller (invoice issue must succeed regardless).

export interface TrustSignalPayload {
  version: "1.0";
  event: "invoice_issued";
  emitted_at: string;
  pair: {
    seller_wallet: string;
    buyer_wallet: string;
  };
  period: string;
  totals: {
    total_jpy?: number;
    settle_event_count: number;
  };
  context_origin: {
    discovery_layer: "paylog";
    discovered_at?: string;
  };
  invoice_pdf_hash: string;
  invoice_number: string;
}

export async function notifyTrustSignal(
  payload: TrustSignalPayload,
): Promise<void> {
  const url = process.env.TAGAMIE_TRUST_SIGNAL_URL;
  const secret = process.env.TAGAMIE_TRUST_SIGNAL_SECRET;
  if (!url || !secret) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trust-signal-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      console.warn(
        JSON.stringify({
          event: "trust_signal_failed",
          status: res.status,
          body: text.slice(0, 200),
          invoice: payload.invoice_number,
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "trust_signal_error",
        error: message,
        invoice: payload.invoice_number,
      }),
    );
  }
}
