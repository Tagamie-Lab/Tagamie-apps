import { issueNonce, cleanupExpiredNonces } from "@/lib/auth/siwe";

export async function POST() {
  // Best-effort cleanup, non-blocking
  cleanupExpiredNonces().catch(() => {});
  const { nonce, expiresAt } = await issueNonce();
  return Response.json({ nonce, expiresAt: expiresAt.toISOString() });
}
