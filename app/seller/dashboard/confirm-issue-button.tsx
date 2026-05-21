"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
}

export function ConfirmIssueButton({ invoiceId, invoiceNumber }: Props) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    const ok = window.confirm(
      `${invoiceNumber} を確定・交付しますか?\n\n` +
        "確定すると PDF が生成され、 買い手側にも公開されます。\n" +
        "発行者責任は seller 本人にあります (消費税法 57 条の 4)。",
    );
    if (!ok) return;

    setPending(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/seller/invoices/${invoiceId}/issue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`エラー: ${data.error ?? res.status}`);
        return;
      }
      setMsg(`確定済 (hash ${(data.pdfHash as string).slice(0, 12)}…)`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {pending ? "確定中…" : "確定・交付"}
      </button>
      {msg && (
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
          {msg}
        </span>
      )}
    </div>
  );
}
