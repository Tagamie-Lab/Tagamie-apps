import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  const address = session.address.toLowerCase();

  // Look up by primary payToAddress OR wallets-table link
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

  return Response.json({
    authenticated: true,
    registered: false,
    address,
  });
}
