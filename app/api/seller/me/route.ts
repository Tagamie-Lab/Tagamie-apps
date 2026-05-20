import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  const address = session.address.toLowerCase();

  // Look up by primary payToAddress first.
  const byPrimary = await db
    .select({ id: schema.sellers.id, displayName: schema.sellers.displayName })
    .from(schema.sellers)
    .where(eq(schema.sellers.payToAddress, address))
    .limit(1);

  if (byPrimary[0]) {
    return Response.json({
      authenticated: true,
      registered: true,
      address,
      sellerId: byPrimary[0].id,
      displayName: byPrimary[0].displayName,
    });
  }

  // Fall back to the wallets-table link so that a seller signing in with a
  // sub-wallet (not the primary payToAddress) is still resolved as registered.
  // Without this, the registration form's "未登録" check would send the user
  // back to /seller/register even though they already exist (review item #7).
  const walletLink = await db
    .select({ sellerId: schema.wallets.sellerId })
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.address, address),
        eq(schema.wallets.ownerType, "seller"),
      ),
    )
    .limit(1);

  if (walletLink[0]?.sellerId) {
    const linked = await db
      .select({
        id: schema.sellers.id,
        displayName: schema.sellers.displayName,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, walletLink[0].sellerId))
      .limit(1);
    if (linked[0]) {
      return Response.json({
        authenticated: true,
        registered: true,
        address,
        sellerId: linked[0].id,
        displayName: linked[0].displayName,
      });
    }
  }

  return Response.json({
    authenticated: true,
    registered: false,
    address,
  });
}
