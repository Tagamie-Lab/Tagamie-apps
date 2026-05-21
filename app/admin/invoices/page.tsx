import Link from "next/link";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { jstMonthBounds } from "@/lib/aggregation/queries";
import { lookupTaxNumber } from "@/lib/tax-number/verify";
import { RunAggregationButton } from "./run-aggregation-button";
import { IssuePdfButton } from "./issue-pdf-button";
import { SeedMicropaymentsButton } from "./seed-micropayments-button";

export const dynamic = "force-dynamic";

interface SearchParams {
  year?: string;
  month?: string;
}

function defaultJstYearMonth(): { year: number; month: number } {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: jstNow.getUTCFullYear(), month: jstNow.getUTCMonth() + 1 };
}

function parsePeriod(sp: SearchParams) {
  const def = defaultJstYearMonth();
  const year = Number(sp.year) || def.year;
  const month = Number(sp.month) || def.month;
  return { year, month };
}

function formatMinor(value: bigint, asset: "JPYC" | "USDC"): string {
  if (asset === "JPYC") {
    return `¥${(value / 10n ** 18n).toLocaleString()}`;
  }
  return `${(Number(value) / 1_000_000).toFixed(6)} USDC`;
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp);
  const bounds = jstMonthBounds(year, month);

  const [eventsInPeriod] = await db
    .select({ value: count() })
    .from(schema.settleEvents)
    .where(
      and(
        gte(schema.settleEvents.occurredAt, bounds.startUtc),
        lt(schema.settleEvents.occurredAt, bounds.endUtc),
      ),
    );

  const invoices = await db.query.invoices.findMany({
    where: eq(schema.invoices.periodMonth, bounds.periodMonth),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const invoiceIds = invoices.map((i) => i.id);
  const taxLines =
    invoiceIds.length > 0
      ? await db.query.invoiceTaxLines.findMany({
          where: (t, { inArray }) => inArray(t.invoiceId, invoiceIds),
        })
      : [];
  const taxLinesByInvoice = new Map<string, typeof taxLines>();
  for (const l of taxLines) {
    const arr = taxLinesByInvoice.get(l.invoiceId) ?? [];
    arr.push(l);
    taxLinesByInvoice.set(l.invoiceId, arr);
  }

  const sellerIds = Array.from(new Set(invoices.map((i) => i.sellerId)));
  const buyerIds = Array.from(new Set(invoices.map((i) => i.buyerId)));
  const sellers =
    sellerIds.length > 0
      ? await db.query.sellers.findMany({
          where: (t, { inArray }) => inArray(t.id, sellerIds),
        })
      : [];
  const buyers =
    buyerIds.length > 0
      ? await db.query.buyers.findMany({
          where: (t, { inArray }) => inArray(t.id, buyerIds),
        })
      : [];
  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const buyerById = new Map(buyers.map((b) => [b.id, b]));

  // T-number verification status for sellers in view
  const taxNumbers = Array.from(new Set(sellers.map((s) => s.taxNumber)));
  const verifyResults = await Promise.all(taxNumbers.map((n) => lookupTaxNumber(n)));
  const taxStatusByNumber = new Map(
    taxNumbers.map((n, i) => [n, verifyResults[i]]),
  );

  const monthOptions: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    monthOptions.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tagamie · Admin / Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500">
            月次集計と 1 万円未満判定 (買い手側 少額特例参考) の確認画面 (W2)
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← top
        </Link>
      </header>

      <form className="mb-6 flex items-end gap-3" method="get">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-zinc-500">対象月 (JST)</span>
          <select
            name="period"
            className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            defaultValue={`${year}-${String(month).padStart(2, "0")}`}
          >
            {monthOptions.map((o) => {
              const key = `${o.year}-${String(o.month).padStart(2, "0")}`;
              return (
                <option key={key} value={key}>
                  {o.year}年 {o.month}月
                </option>
              );
            })}
          </select>
        </label>
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          formAction={`/admin/invoices`}
          className="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          表示
        </button>
        <RunAggregationButton year={year} month={month} />
        {process.env.NODE_ENV !== "production" && (
          <SeedMicropaymentsButton year={year} month={month} />
        )}
      </form>

      <section className="mb-6 rounded border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          対象月: <strong>{bounds.periodMonth.slice(0, 7)}</strong>
        </div>
        <div>
          settle_events 件数 (JST {bounds.startUtc.toISOString().slice(0, 10)} ~):{" "}
          <strong>{eventsInPeriod?.value ?? 0}</strong>
        </div>
        <div>
          invoices 件数: <strong>{invoices.length}</strong>
        </div>
      </section>

      {/* 国税庁 適格請求書発行事業者公表システム Web-API 利用規約 第 6 条:
          情報の取得元の明示。verify バッジ表示画面にも掲示が必要。
          See: knowledge/nta.md §利用規約 第 6 条 */}
      <p className="mb-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        本画面に表示される登録番号情報は、国税庁
        適格請求書発行事業者公表システム Web-API
        機能を利用して取得した情報をもとに作成しているが、国税庁によって保証されたものではない。
      </p>

      {invoices.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          この月の invoice はまだありません。「Run aggregation」ボタンで集計を実行できます。
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Invoice #</th>
                <th className="px-3 py-2">Seller (T#)</th>
                <th className="px-3 py-2">Buyer</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Tax breakdown</th>
                <th className="px-3 py-2" title="1 万円未満該当あり / 買い手側で少額特例適用可能性あり (2029-09-30 まで)">1 万円未満</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const seller = sellerById.get(inv.sellerId);
                const buyer = buyerById.get(inv.buyerId);
                const tnVerify = seller
                  ? taxStatusByNumber.get(seller.taxNumber)
                  : null;
                const lines = taxLinesByInvoice.get(inv.id) ?? [];
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-3 py-2">
                      <div>{seller?.displayName ?? "—"}</div>
                      <div className="font-mono text-xs text-zinc-500">
                        {seller?.taxNumber}
                        <span
                          className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] ${
                            tnVerify?.status === "active"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}
                        >
                          {tnVerify?.status ?? "uncached"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {buyer?.legalName ?? (
                        <span className="font-mono text-xs">
                          {buyer?.walletAddress.slice(0, 10)}…
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatMinor(inv.totalMinor, inv.asset)}
                    </td>
                    <td className="px-3 py-2">
                      {lines.map((l) => (
                        <div key={l.id} className="text-xs">
                          {l.taxRateBps / 100}%: 税抜{" "}
                          {formatMinor(l.subtotalMinor, inv.asset)} + 税{" "}
                          {formatMinor(l.taxMinor, inv.asset)} ({l.eventCount} 件)
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      {inv.smallAmountExemptionApplied ? (
                        <span
                          className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          title="1 万円未満の取引が含まれる。 買い手側で少額特例 (消費税法 30 条の 2、 期限 2029-09-30) 適用可能性あり"
                        >
                          該当
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <IssuePdfButton
                          invoiceId={inv.id}
                          alreadyIssued={Boolean(inv.pdfUrl)}
                        />
                        {inv.pdfUrl && (
                          <a
                            href={`/api/admin/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            DL
                          </a>
                        )}
                        {inv.pdfHash && (
                          <span
                            className="font-mono text-[10px] text-zinc-400"
                            title={inv.pdfHash}
                          >
                            {inv.pdfHash.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 申請書 2.4.1 / 2.7.1 「顧客の方も利用されるプログラムで登録番号以外の情報から検索することが
          できる仕様となっている場合は、発行申請の承認ができません」への準拠ポリシー。
          T 番号 verify の入力 UI を登録番号入力に限定し、法人名検索は本画面では一切行わない。
          法人名→法人番号の逆引きが必要な場合は、別系統の法人番号 Web-API 経由で完結させる。
          See: knowledge/nta.md §申請書記入時の不整合パターン (2.4.1 / 2.7.1) */}
      <section className="mt-8 rounded border border-dashed border-zinc-300 p-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">
          T 番号入力 UI ポリシー
        </div>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            本画面の T 番号 verify は、seller 登録時に保存された登録番号
            (T + 13 桁) のみを照合対象とする。検索フォームは提供しない。
          </li>
          <li>
            法人名 / 屋号 / 住所からの逆引き検索は本画面では行わない。法人名 →
            法人番号の解決が必要な場合は、別途国税庁 法人番号 Web-API を利用する。
          </li>
          <li>
            上記制約は、国税庁 適格請求書発行事業者公表システム Web-API
            利用規約および申請書 2.7.1 注記への準拠を目的とする。
          </li>
        </ul>
      </section>
    </div>
  );
}
