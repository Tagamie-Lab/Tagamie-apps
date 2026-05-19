"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  invoiceId: string;
  alreadyIssued: boolean;
}

export function IssuePdfButton({ invoiceId, alreadyIssued }: Props) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/issue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${data.error ?? res.status}`);
        return;
      }
      setMsg(`hash ${(data.pdfHash as string).slice(0, 12)}… / ${data.byteLength} B`);
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
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "発行中…" : alreadyIssued ? "再発行" : "PDF 発行"}
      </button>
      {msg && <span className="text-[10px] text-zinc-500">{msg}</span>}
    </div>
  );
}
