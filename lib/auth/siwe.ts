import "server-only";
import { SiweMessage, generateNonce } from "siwe";
import { eq, lt } from "drizzle-orm";
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

export async function verifySiwe(
  message: string,
  signature: `0x${string}`,
): Promise<SiweVerifyResult> {
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
  } catch {
    return { ok: false, error: "invalid_message_format" };
  }

  const rows = await db
    .select()
    .from(authNonces)
    .where(eq(authNonces.nonce, siwe.nonce))
    .limit(1);
  const nonceRow = rows[0];
  if (!nonceRow) {
    return { ok: false, error: "unknown_nonce" };
  }
  if (nonceRow.consumedAt) {
    return { ok: false, error: "nonce_already_used" };
  }
  if (nonceRow.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "nonce_expired" };
  }

  try {
    const verification = await siwe.verify({
      signature,
      nonce: siwe.nonce,
    });
    if (!verification.success) {
      return { ok: false, error: "signature_invalid" };
    }
  } catch {
    return { ok: false, error: "signature_invalid" };
  }

  await db
    .update(authNonces)
    .set({ consumedAt: new Date() })
    .where(eq(authNonces.nonce, siwe.nonce));

  return {
    ok: true,
    address: siwe.address.toLowerCase(),
    chainId: siwe.chainId,
  };
}
