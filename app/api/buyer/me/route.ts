import { and, eq } from "drizzle-orm";
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

  // Mirror the dashboard's wallets-table fallback so sub-wallet sign-in does
  // not bounce a registered buyer back to /buyer/register (review item #7).
  const walletLink = await db
    .select({ buyerId: schema.wallets.buyerId })
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.address, address),
        eq(schema.wallets.ownerType, "buyer"),
      ),
    )
    .limit(1);

  if (walletLink[0]?.buyerId) {
    const linked = await db
      .select({
        id: schema.buyers.id,
        businessName: schema.buyers.businessName,
        legalName: schema.buyers.legalName,
      })
      .from(schema.buyers)
      .where(eq(schema.buyers.id, walletLink[0].buyerId))
      .limit(1);
    if (linked[0]) {
      return Response.json({
        authenticated: true,
        registered: true,
        address,
        buyerId: linked[0].id,
        label: linked[0].businessName ?? linked[0].legalName ?? null,
      });
    }
  }

  return Response.json({
    authenticated: true,
    registered: false,
    address,
  });
}
