import { Button } from "@/components/ui/button";

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
          x402 settle → 月次合算 → 適格請求書 → freee 連携、全自動。
        </p>

        <div className="flex flex-wrap gap-3 justify-center pt-4">
          <Button size="lg" disabled>
            β を試す（準備中）
          </Button>
          <Button size="lg" variant="outline" disabled>
            動くデモを見る
          </Button>
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-600 pt-12">
          近江商人「三方良し」のデジタル版。
        </p>
      </main>
    </div>
  );
}
