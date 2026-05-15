"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunAggregationButton({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/aggregate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${data.error ?? res.status}`);
      } else {
        const created = data.buckets.filter(
          (b: { status: string }) => b.status === "created",
        ).length;
        const skipped = data.buckets.filter(
          (b: { status: string }) => b.status === "skipped_existing",
        ).length;
        setMsg(
          `Buckets considered: ${data.bucketsConsidered}, created: ${created}, skipped (existing): ${skipped}`,
        );
        startTransition(() => router.refresh());
      }
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
        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "集計中…" : "Run aggregation"}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
