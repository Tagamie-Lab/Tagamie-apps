import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

function formatMinor(value: bigint, asset: "JPYC" | "USDC"): string {
  if (asset === "JPYC") {
    return `¥${(value / 10n ** 18n).toLocaleString()}`;
  }
  return `${(Number(value) / 1_000_000).toFixed(6)} USDC`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default async function BuyerDashboardPage() {
  const session = await getSession();
  if (!session.address) {
    redirect("/?auth=required&next=/buyer/dashboard");
  }
  const sessionAddress = session.address.toLowerCase();

  // Locate buyer by primary wallet OR linked wallets table
  const buyerByPrimary = await db
    .select()
    .from(schema.buyers)
    .where(eq(schema.buyers.walletAddress, sessionAddress))
    .limit(1);

  const walletLinks = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.address, sessionAddress),
        eq(schema.wallets.ownerType, "buyer"),
      ),
    );

  let buyer = buyerByPrimary[0];
  if (!buyer && walletLinks[0]?.buyerId) {
    const rows = await db
      .select()
      .from(schema.buyers)
      .where(eq(schema.buyers.id, walletLinks[0].buyerId))
      .limit(1);
    buyer = rows[0];
  }

  if (!buyer) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Header address={sessionAddress} />
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">未登録 wallet</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            この wallet (<code className="font-mono">{sessionAddress}</code>) は
            まだ buyer として登録されていません。
          </p>
          <Link
            href="/buyer/register"
            className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            登録する →
          </Link>
        </div>
      </main>
    );
  }

  // All wallets owned by this buyer
  const allBuyerWallets = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.buyerId, buyer.id));
  const addresses = new Set<string>([buyer.walletAddress]);
  for (const w of allBuyerWallets) addresses.add(w.address);

  // Fetch invoices for this buyer (all periods, latest 50)
  const invoices = await db.query.invoices.findMany({
    where: eq(schema.invoices.buyerId, buyer.id),
    orderBy: (t) => [desc(t.periodMonth), desc(t.createdAt)],
    limit: 50,
  });

  const sellerIds = Array.from(new Set(invoices.map((i) => i.sellerId)));
  const sellers =
    sellerIds.length > 0
      ? await db
          .select()
          .from(schema.sellers)
          .where(inArray(schema.sellers.id, sellerIds))
      : [];
  const sellerById = new Map(sellers.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Header address={sessionAddress} />

      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">登録情報</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row label="屋号" value={buyer.businessName ?? "—"} />
          <Row label="法人名" value={buyer.legalName ?? "—"} />
          <Row label="Email" value={buyer.email ?? "—"} />
          <Row
            label="登録 wallets"
            value={Array.from(addresses)
              .map((a) => shortAddr(a))
              .join(", ")}
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">受領した適格請求書</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          月初 cron で発行された適格請求書 PDF を表示しています。
        </p>

        {invoices.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            まだ受領 invoice はありません。
            JPYC で取引が発生し、 翌月初の cron が走ると表示されます。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {invoices.map((inv) => {
              const seller = sellerById.get(inv.sellerId);
              return (
                <li key={inv.id} className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-sm">
                      #{inv.invoiceNumber}
                    </span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-medium">
                      {seller?.displayName ?? "—"}
                    </span>
                    {seller?.taxNumber && (
                      <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                        ({seller.taxNumber})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    期間 {inv.periodMonth}
                    {inv.smallAmountExemptionApplied && " · 少額特例適用"}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-lg font-semibold">
                      {formatMinor(inv.totalMinor as bigint, inv.asset)}
                    </span>
                    {inv.pdfUrl && (
                      <Link
                        href={`/api/buyer/invoices/${inv.id}/pdf`}
                        className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                      >
                        PDF DL
                      </Link>
                    )}
                    {inv.pdfHash && (
                      <span className="font-mono text-xs text-zinc-400">
                        sha256:{inv.pdfHash.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
        Phase 0 試験実装段階。
      </p>
    </main>
  );
}

function Header({ address }: { address: string }) {
  return (
    <header className="flex items-center justify-between">
      <nav className="text-xs uppercase tracking-widest text-zinc-500">
        <Link href="/" className="hover:text-zinc-800 dark:hover:text-zinc-300">
          Tagamie
        </Link>
        {" / "}
        <span className="text-zinc-800 dark:text-zinc-200">
          Buyer Dashboard
        </span>
      </nav>
      <div className="flex items-center gap-3 text-xs">
        <code className="font-mono text-zinc-600 dark:text-zinc-400">
          {address.slice(0, 6)}…{address.slice(-4)}
        </code>
        <LogoutButton />
      </div>
    </header>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "issued" | "voided" }) {
  const styles: Record<typeof status, string> = {
    draft:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    issued:
      "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    voided: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
