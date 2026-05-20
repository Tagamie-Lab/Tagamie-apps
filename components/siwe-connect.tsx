"use client";
import { useState } from "react";
import { signInWithEthereum } from "@/lib/auth/siwe-client";

interface Props {
  onConnected: (result: { address: string; chainId: number }) => void;
}

export function SiweConnect({ onConnected }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(forceAccountSelector: boolean) {
    setPending(true);
    setError(null);
    try {
      const result = await signInWithEthereum({ forceAccountSelector });
      onConnected(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => handleClick(false)}
          className="rounded-md bg-black text-white px-5 py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {pending ? "署名待ち…" : "Wallet を接続して署名"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => handleClick(true)}
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          別の wallet を選んで署名
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        EIP-4361 (Sign-In With Ethereum) で wallet 所有を確認します。 ガス代は不要です。
        <br />
        seller と buyer で違う wallet を使う場合は「別の wallet を選んで署名」 をクリックしてください。
      </p>
    </div>
  );
}
