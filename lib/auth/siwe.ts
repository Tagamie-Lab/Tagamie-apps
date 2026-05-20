import "server-only";
import { SiweMessage, generateNonce } from "siwe";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { authNonces } from "@/lib/db/schema";

const NONCE_TTL_MS = 10 * 60 * 1000;

export type SiweVerifyResult =
  | { ok: true; address: string; chainId: number }
  | { ok: false; error: string };

export async function issueNonce(): Promise<{
  nonce: string;
  expiresAt: Date;
}> {
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await db.insert(authNonces).values({ nonce, expiresAt });
  return { nonce, expiresAt };
}

export async function cleanupExpiredNonces(): Promise<void> {
  await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date()));
}

/**
 * Verify a SIWE (EIP-4361) message + signature.
 *
 * `expectedDomain` should be the server's expected host (from
 * `req.headers.get("host")`). Passing it to `siwe.verify({ domain })` makes
 * the verifier reject messages whose `domain:` line does not match — closing
 * the gap where a stolen nonce could be replayed against another origin
 * (review item #2).
 *
 * Nonce consumption is now a single atomic UPDATE-with-RETURNING (review
 * item #3): if the claim succeeds, the nonce is burned regardless of whether
 * the signature later checks out. This prevents two parallel verify calls
 * from both observing the nonce as un-consumed under READ COMMITTED, and
 * removes any retry window if the caller's signature is bad.
 */
export async function verifySiwe(
  message: string,
  signature: `0x${string}`,
  expectedDomain?: string,
): Promise<SiweVerifyResult> {
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
  } catch {
    return { ok: false, error: "invalid_message_format" };
  }

  // Atomic single-use claim: only succeeds if the nonce is unknown-to-DB-no /
  // un-consumed / un-expired. Burns the nonce up-front so a parallel request
  // cannot also pass this gate.
  const now = new Date();
  const claimed = await db
    .update(authNonces)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authNonces.nonce, siwe.nonce),
        isNull(authNonces.consumedAt),
        gte(authNonces.expiresAt, now),
      ),
    )
    .returning({ nonce: authNonces.nonce });

  if (claimed.length === 0) {
    // Differentiate failure modes for diagnostics. The nonce was not claimed,
    // so this read does not race with anything that matters.
    const probe = await db
      .select({
        consumedAt: authNonces.consumedAt,
        expiresAt: authNonces.expiresAt,
      })
      .from(authNonces)
      .where(eq(authNonces.nonce, siwe.nonce))
      .limit(1);
    if (probe.length === 0) return { ok: false, error: "unknown_nonce" };
    if (probe[0].consumedAt)
      return { ok: false, error: "nonce_already_used" };
    return { ok: false, error: "nonce_expired" };
  }

  try {
    const verification = await siwe.verify({
      signature,
      nonce: siwe.nonce,
      ...(expectedDomain ? { domain: expectedDomain } : {}),
    });
    if (!verification.success) {
      return { ok: false, error: "signature_invalid" };
    }
  } catch {
    return { ok: false, error: "signature_invalid" };
  }

  return {
    ok: true,
    address: siwe.address.toLowerCase(),
    chainId: siwe.chainId,
  };
}
