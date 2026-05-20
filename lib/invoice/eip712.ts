import "server-only";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * EIP-712 typed-data signature for Tagamie's canonical invoice.
 *
 * The signed payload is the cryptographic "適格請求書 canonical" — see
 * [[tagamie-platform-spec]] §3.4. The PDF and NFT mint are derived
 * artifacts; this signature anchors invoice authenticity.
 */

export const TAGAMIE_EIP712_DOMAIN = {
  name: "Tagamie InvoiceNFT",
  version: "1",
  // chainId: 0 means the signature is chain-agnostic at the metadata level;
  // the NFT mint records the chain separately in invoices.nft_chain.
  chainId: 0,
  // verifyingContract: zero address until the InvoiceNFT contract is
  // deployed (W-3). At that point this becomes the deployed address per chain.
  verifyingContract:
    "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;

export const TAGAMIE_EIP712_TYPES = {
  Invoice: [
    { name: "invoiceNumber", type: "string" },
    { name: "periodMonth", type: "string" }, // "YYYY-MM-01"
    { name: "sellerLegalName", type: "string" },
    { name: "sellerTaxNumber", type: "string" }, // T#
    { name: "sellerAddress", type: "address" },
    { name: "buyerAddress", type: "address" },
    { name: "asset", type: "string" },
    { name: "totalMinor", type: "uint256" },
    { name: "subtotalMinor", type: "uint256" },
    { name: "taxMinor", type: "uint256" },
    { name: "smallAmountExemptionApplied", type: "bool" },
    { name: "pdfHash", type: "bytes32" }, // SHA-256 of the PDF bytes
    { name: "issuedAt", type: "uint64" }, // unix seconds
  ],
} as const;

export interface InvoiceTypedDataMessage {
  invoiceNumber: string;
  periodMonth: string;
  sellerLegalName: string;
  sellerTaxNumber: string;
  sellerAddress: `0x${string}`;
  buyerAddress: `0x${string}`;
  asset: "JPYC" | "USDC";
  totalMinor: bigint;
  subtotalMinor: bigint;
  taxMinor: bigint;
  smallAmountExemptionApplied: boolean;
  pdfHash: `0x${string}`;
  issuedAt: bigint;
}

function getSignerKey(): `0x${string}` {
  const key = process.env.INVOICE_SIGNER_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "INVOICE_SIGNER_PRIVATE_KEY is not set. Generate via `cast wallet new` or viem and set in .env.local (Phase 1 will move to KMS).",
    );
  }
  return key.startsWith("0x")
    ? (key as `0x${string}`)
    : (`0x${key}` as `0x${string}`);
}

export function getSignerAddress(): `0x${string}` {
  const account = privateKeyToAccount(getSignerKey());
  return account.address;
}

/**
 * Convert a hex string like "abcd..." (no 0x) to a 32-byte 0x... string.
 * Throws if the input is not exactly 64 hex chars.
 */
export function pdfHashHex(sha256Hex: string): `0x${string}` {
  const raw = sha256Hex.startsWith("0x") ? sha256Hex.slice(2) : sha256Hex;
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error(`pdfHash must be 64 hex chars (SHA-256), got ${raw.length}`);
  }
  return `0x${raw.toLowerCase()}` as `0x${string}`;
}

export function invoiceMessageHash(
  message: InvoiceTypedDataMessage,
): `0x${string}` {
  return hashTypedData({
    domain: TAGAMIE_EIP712_DOMAIN,
    types: TAGAMIE_EIP712_TYPES,
    primaryType: "Invoice",
    message,
  });
}

export async function signInvoiceTypedData(
  message: InvoiceTypedDataMessage,
): Promise<{ signature: `0x${string}`; messageHash: `0x${string}` }> {
  const account = privateKeyToAccount(getSignerKey());
  const signature = await account.signTypedData({
    domain: TAGAMIE_EIP712_DOMAIN,
    types: TAGAMIE_EIP712_TYPES,
    primaryType: "Invoice",
    message,
  });
  const messageHash = invoiceMessageHash(message);
  return { signature, messageHash };
}

/**
 * Build the on-the-wire JSON representation of the EIP-712 signed message
 * for pinning to IPFS as the canonical metadata blob.
 */
export function invoiceTypedDataJson(
  message: InvoiceTypedDataMessage,
  signature: `0x${string}`,
): Record<string, unknown> {
  return {
    standard: "EIP-712",
    domain: {
      name: TAGAMIE_EIP712_DOMAIN.name,
      version: TAGAMIE_EIP712_DOMAIN.version,
      chainId: TAGAMIE_EIP712_DOMAIN.chainId,
      verifyingContract: TAGAMIE_EIP712_DOMAIN.verifyingContract,
    },
    primaryType: "Invoice",
    types: TAGAMIE_EIP712_TYPES,
    message: {
      ...message,
      totalMinor: message.totalMinor.toString(),
      subtotalMinor: message.subtotalMinor.toString(),
      taxMinor: message.taxMinor.toString(),
      issuedAt: message.issuedAt.toString(),
    },
    signature,
    signer: getSignerAddress(),
  };
}
