import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { LogoutButton } from "../../buyer/dashboard/logout-button";
import { ConfirmIssueButton } from "./confirm-issue-button";

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

export default async function SellerDashboardPage() {
  const session = await getSession();
  if (!session.address) {
    redirect("/?auth=required&next=/seller/dashboard");
  }
  const sessionAddress = session.address.toLowerCase();

  const sellerByPrimary = await db
    .select()
    .from(schema.sellers)
    .where(eq(schema.sellers.payToAddress, sessionAddress))
    .limit(1);

  const walletLinks = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.address, sessionAddress),
        eq(schema.wallets.ownerType, "seller"),
      ),
    );

  let seller = sellerByPrimary[0];
  if (!seller && walletLinks[0]?.sellerId) {
    const rows = await db
      .select()
      .from(schema.sellers)
      .where(eq(schema.sellers.id, walletLinks[0].sellerId))
      .limit(1);
    seller = rows[0];
  }

  if (!seller) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Header address={sessionAddress} />
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">未登録 wallet</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            この wallet (<code className="font-mono">{sessionAddress}</code>) は
            まだ seller として登録されていません。
          </p>
          <Link
            href="/seller/register"
            className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            登録する →
          </Link>
        </div>
      </main>
    );
  }

  const allSellerWallets = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.sellerId, seller.id));
  const addresses = new Set<string>([seller.payToAddress]);
  for (const w of allSellerWallets) addresses.add(w.address);

  const invoices = await db.query.invoices.findMany({
    where: eq(schema.invoices.sellerId, seller.id),
    orderBy: (t) => [desc(t.periodMonth), desc(t.createdAt)],
    limit: 50,
  });

  const buyerIds = Array.from(new Set(invoices.map((i) => i.buyerId)));
  const buyers =
    buyerIds.length > 0
      ? await db
          .select()
          .from(schema.buyers)
          .where(inArray(schema.buyers.id, buyerIds))
      : [];
  const buyerById = new Map(buyers.map((b) => [b.id, b]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Header address={sessionAddress} />

      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">登録情報</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row label="屋号 / 表示名" value={seller.displayName} />
          <Row label="法人名" value={seller.legalName} />
          <Row label="T 番号" value={seller.taxNumber} />
          <Row label="取引担当者" value={seller.transactionAgentName ?? "—"} />
          <Row label="Email" value={seller.email ?? "—"} />
          <Row label="業種" value={seller.industry ?? "—"} />
          <Row
            label="登録 wallets"
            value={Array.from(addresses)
              .map((a) => shortAddr(a))
              .join(", ")}
          />
          <Row
            label="採番カウンタ"
            value={String(seller.invoiceCounter)}
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">適格請求書 (draft / 確定済)</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          月初 cron で月次集計が走り、 draft invoice が自動作成されます。
          内容を確認し「確定・交付」 で PDF 生成 + 買い手に公開されます
          (発行者責任は seller 本人。 消費税法 57 条の 4)。
        </p>

        {invoices.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            まだ発行 invoice はありません。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {invoices.map((inv) => {
              const buyer = buyerById.get(inv.buyerId);
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
                      {buyer?.businessName ??
                        buyer?.legalName ??
                        shortAddr(buyer?.walletAddress ?? "0x")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    期間 {inv.periodMonth}
                    {inv.smallAmountExemptionApplied && (
                      <span
                        title="1 万円未満の取引が含まれる。 買い手側で少額特例 (消費税法 30 条の 2、 期限 2029-09-30) 適用可能性あり"
                      >
                        {" "}· 1 万円未満該当 (買い手側 少額特例参考)
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-lg font-semibold">
                      {formatMinor(inv.totalMinor as bigint, inv.asset)}
                    </span>
                    {inv.status === "draft" && (
                      <ConfirmIssueButton
                        invoiceId={inv.id}
                        invoiceNumber={inv.invoiceNumber}
                      />
                    )}
                    {inv.pdfUrl && (
                      <Link
                        href={`/api/seller/invoices/${inv.id}/pdf`}
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
          Seller Dashboard
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
