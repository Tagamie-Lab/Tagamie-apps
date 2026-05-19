"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  year: number;
  month: number;
}

export function SeedMicropaymentsButton({ year, month }: Props) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/seed-micropayments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, month, count: 80 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${data.error ?? res.status}`);
        return;
      }
      setMsg(
        `inserted: ${data.insertedNew}, skipped(dup): ${data.skippedDuplicate} → ${data.buyerName}`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(`Network error: ${(e as Error).message}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        title="dev only: 80 件のマイクロペイメントを当月に seed"
      >
        {pending ? "seeding…" : "🧪 seed 80 micropayments (dev)"}
      </button>
      {msg && <span className="text-[10px] text-zinc-500">{msg}</span>}
    </div>
  );
}
