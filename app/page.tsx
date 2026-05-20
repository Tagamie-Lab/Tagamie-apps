import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-black px-6">
      <main className="w-full max-w-3xl flex flex-col items-center text-center gap-8">
        <p className="text-sm uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Tagamie · 互い見え
        </p>

        <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-black dark:text-zinc-50">
          お互いに
          <br className="sm:hidden" />
          クリアな世界へ。
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          seller も buyer も、税務署も。同じ取引を、同じ精度で見る。
          <br />
          JPYC の on-chain 取引を自動集計して、毎月 1 日に適格請求書 PDF を自動発行。
        </p>

        <div className="flex flex-wrap gap-3 justify-center pt-4">
          <Link
            href="/seller/register"
            className="rounded-md bg-black px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Seller として登録
          </Link>
          <Link
            href="/buyer/register"
            className="rounded-md border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-black hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
          >
            Buyer として登録
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 justify-center text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/seller/dashboard" className="hover:underline">
            Seller Dashboard →
          </Link>
          <span>·</span>
          <Link href="/buyer/dashboard" className="hover:underline">
            Buyer Dashboard →
          </Link>
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-600 pt-8">
          Phase 0 試験実装段階 · facilitator agnostic (yen402 / CDP / MetaMask MCP)
        </p>

        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          近江商人「三方良し」のデジタル版。
        </p>
      </main>
    </div>
  );
}
