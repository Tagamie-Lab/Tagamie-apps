import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  return Response.json({
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
    issuedAt: session.issuedAt,
  });
}
