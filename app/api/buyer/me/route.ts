import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  const address = session.address.toLowerCase();

  const byPrimary = await db
    .select({
      id: schema.buyers.id,
      businessName: schema.buyers.businessName,
      legalName: schema.buyers.legalName,
    })
    .from(schema.buyers)
    .where(eq(schema.buyers.walletAddress, address))
    .limit(1);

  if (byPrimary[0]) {
    return Response.json({
      authenticated: true,
      registered: true,
      address,
      buyerId: byPrimary[0].id,
      label: byPrimary[0].businessName ?? byPrimary[0].legalName ?? null,
    });
  }

  return Response.json({
    authenticated: true,
    registered: false,
    address,
  });
}
