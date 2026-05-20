import "server-only";

/**
 * Pinata IPFS pinning helpers.
 *
 * Setup outside of code:
 *   - Sign up at https://pinata.cloud and create a JWT (API → New Key →
 *     Admin permissions or pinFileToIPFS + pinJSONToIPFS).
 *   - Set PINATA_JWT in env.
 *   - Optional: PINATA_GATEWAY_HOST to use a custom dedicated gateway.
 *
 * Files pinned here are publicly retrievable via any IPFS gateway. This is
 * required by the [[tagamie-platform-spec]] §3.4 three-layer design where
 * the NFT token URI points to ipfs:// content.
 *
 * PII implications: PDFs pinned here are *public* once their CID is known.
 * See [[jpyc-invoice-nft]] §「乗せるか」 + [[tagamie-pre-release-deploy]] for
 * the L1/L2/L3 boundary and the choice to use plain (vs encrypted) IPFS.
 */

const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT is not set. Sign up at pinata.cloud → API keys → create JWT (with pinFileToIPFS + pinJSONToIPFS scopes).",
    );
  }
  return jwt;
}

export function ipfsGatewayUrl(cid: string, filename?: string): string {
  const host = process.env.PINATA_GATEWAY_HOST ?? "gateway.pinata.cloud";
  const protocol = host.startsWith("http") ? "" : "https://";
  const base = `${protocol}${host}/ipfs/${cid}`;
  return filename ? `${base}?filename=${encodeURIComponent(filename)}` : base;
}

export interface PinResult {
  cid: string;
  pinSize: number;
  timestamp: string;
}

/**
 * Pin a binary blob (e.g., PDF) to Pinata IPFS.
 * Returns the IPFS CID (v1, base32) — usable as `ipfs://${cid}`.
 */
export async function pinFile(
  data: Buffer,
  options: {
    name: string;
    contentType: string;
    keyvalues?: Record<string, string>;
  },
): Promise<PinResult> {
  const form = new FormData();
  // `Buffer` is not directly assignable to `BlobPart` under the Node 20
  // typings (ArrayBufferLike vs ArrayBuffer mismatch). Copy into a fresh
  // Uint8Array so Blob is happy.
  const bytes = new Uint8Array(data);
  const blob = new Blob([bytes], { type: options.contentType });
  form.append("file", blob, options.name);
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: options.name,
      keyvalues: options.keyvalues ?? {},
    }),
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch(PIN_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${getJwt()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pinFile failed ${res.status}: ${text}`);
  }
  const body = (await res.json()) as {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
  };
  return {
    cid: body.IpfsHash,
    pinSize: body.PinSize,
    timestamp: body.Timestamp,
  };
}

/**
 * Pin a JSON document (e.g., NFT token URI metadata or EIP-712 typed-data
 * canonical message).
 */
export async function pinJson(
  json: unknown,
  options: { name: string; keyvalues?: Record<string, string> },
): Promise<PinResult> {
  const res = await fetch(PIN_JSON_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${getJwt()}`,
    },
    body: JSON.stringify({
      pinataContent: json,
      pinataMetadata: {
        name: options.name,
        keyvalues: options.keyvalues ?? {},
      },
      pinataOptions: { cidVersion: 1 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pinJson failed ${res.status}: ${text}`);
  }
  const body = (await res.json()) as {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
  };
  return {
    cid: body.IpfsHash,
    pinSize: body.PinSize,
    timestamp: body.Timestamp,
  };
}
