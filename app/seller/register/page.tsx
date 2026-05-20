import { Suspense } from "react";
import Link from "next/link";
import { SellerRegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default function SellerRegisterPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="text-xs uppercase tracking-widest text-zinc-500">
        <Link href="/" className="hover:text-zinc-800 dark:hover:text-zinc-300">
          Tagamie
        </Link>
        {" / "}
        <span className="text-zinc-800 dark:text-zinc-200">Seller 登録</span>
      </nav>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        売り手 (Seller) 登録
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        適格請求書発行事業者 (T 番号保有) のみご登録いただけます。
        Wallet 認証 (EIP-4361 SIWE) で所有確認のうえ、 事業情報を入力してください。
      </p>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <Suspense fallback={<p className="text-sm">読み込み中…</p>}>
          <SellerRegisterForm />
        </Suspense>
      </div>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Phase 0 試験実装段階。
      </p>
    </main>
  );
}
