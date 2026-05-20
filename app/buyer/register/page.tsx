import { Suspense } from "react";
import Link from "next/link";
import { BuyerRegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default function BuyerRegisterPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="text-xs uppercase tracking-widest text-zinc-500">
        <Link href="/" className="hover:text-zinc-800 dark:hover:text-zinc-300">
          Tagamie
        </Link>
        {" / "}
        <span className="text-zinc-800 dark:text-zinc-200">Buyer 登録</span>
      </nav>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        買い手 (Buyer) 登録
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        JPYC で B2B 取引を行う買い手として登録します。 月初 cron で発行された適格請求書 PDF を dashboard でいつでも受領できます。
      </p>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <Suspense fallback={<p className="text-sm">読み込み中…</p>}>
          <BuyerRegisterForm />
        </Suspense>
      </div>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Phase 0 試験実装段階。
      </p>
    </main>
  );
}
