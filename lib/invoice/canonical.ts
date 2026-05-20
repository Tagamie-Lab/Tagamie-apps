// Format-agnostic invoice payload. Sole intermediary between DB and any output
// format (PDF now, PEPPOL JP PINT XML later). All amounts are minor units.
//
// Reference: knowledge/tagamie-w3.md §タスク 3.1 補足 (CanonicalInvoice 設計)

export type Chain =
  | "polygon"
  | "base"
  | "ethereum"
  | "kaia"
  | "polygonAmoy"
  | "kaiaKairos";
export type Asset = "JPYC" | "USDC";

export interface CanonicalInvoiceSeller {
  displayName: string;
  legalName: string;
  taxNumber: string;
  countryCode: "JP";
}

export interface CanonicalInvoiceBuyer {
  legalName: string | null;
  walletAddress: string;
  taxNumber: string | null;
  countryCode: "JP";
}

export interface CanonicalInvoiceTaxLine {
  taxRateBps: number;
  subtotalMinor: bigint;
  taxMinor: bigint;
  eventCount: number;
}

export interface CanonicalInvoiceLineItem {
  occurredAt: Date;
  amountMinor: bigint;
  txHash: string;
  chain: Chain;
}

export interface CanonicalInvoice {
  invoiceNumber: string;
  /** First day of the JST period (00:00 JST as UTC instant). */
  periodFrom: Date;
  /** Last day of the JST period (23:59:59.999 JST as UTC instant). */
  periodTo: Date;
  /** `YYYY-MM-01` date string identifying the period month. */
  periodMonth: string;
  asset: Asset;
  status: "draft" | "issued" | "voided";
  smallAmountExemptionApplied: boolean;
  totalMinor: bigint;
  subtotalMinor: bigint;
  taxMinor: bigint;
  seller: CanonicalInvoiceSeller;
  buyer: CanonicalInvoiceBuyer;
  taxLines: CanonicalInvoiceTaxLine[];
  lineItems: CanonicalInvoiceLineItem[];
}

const EXPLORERS: Record<Chain, string> = {
  polygon: "https://polygonscan.com/tx/",
  base: "https://basescan.org/tx/",
  ethereum: "https://etherscan.io/tx/",
  kaia: "https://kaiascan.io/tx/",
  polygonAmoy: "https://amoy.polygonscan.com/tx/",
  kaiaKairos: "https://kairos.kaiascan.io/tx/",
};

export function txExplorerUrl(chain: Chain, txHash: string): string {
  return EXPLORERS[chain] + txHash;
}

export function explorerName(chain: Chain): string {
  switch (chain) {
    case "polygon":
      return "Polygonscan";
    case "base":
      return "Basescan";
    case "ethereum":
      return "Etherscan";
    case "kaia":
      return "Kaiascan";
    case "polygonAmoy":
      return "Amoy Polygonscan";
    case "kaiaKairos":
      return "Kairos Kaiascan";
  }
}
