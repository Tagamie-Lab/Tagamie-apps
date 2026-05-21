/**
 * Cross-Layer Context v1.0
 * Shared envelope passed between Discovery (paylog) / Payment (yen402) /
 * MCP bridge (yen402-mcp) / Accounting (Tagamie).
 *
 * Spec: knowledge/cross-layer-context.md
 *
 * Status in this repo: type is defined for ingest-side validation when
 * yen402 facilitator webhook delivers context (Sprint S3 of the loop
 * closure work). Current invoice load path tolerates missing context
 * gracefully (knowledge/cross-layer-context.md §6 backward compatibility).
 */
export interface CrossLayerContext {
  version: "1.0";
  intent?: string;
  service: {
    name: string;
    category?: string;
    endpoint?: string;
    counterparty_wallet: string;
  };
  description?: string;
  invoice_hints?: {
    tax_category?: "standard_10" | "reduced_8" | "exempt";
    receipt_id?: string;
  };
  source?: {
    discovery_layer: "paylog" | "manual" | "other";
    discovered_at?: string;
    trust_score_at_discovery?: number;
  };
}
