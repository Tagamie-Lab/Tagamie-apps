"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SiweConnect } from "@/components/siwe-connect";

const TERMS_VERSION = "2026-05-20-v1-draft";
const PRIVACY_VERSION = "2026-05-20-v1-draft";

type Step = "connect" | "form" | "done";

export function SellerRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("connect");
  const [address, setAddress] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleConnected(result: { address: string; chainId: number }) {
    setAddress(result.address);
    const me = await fetch("/api/seller/me").then((r) => r.json()).catch(() => null);
    if (me?.registered) {
      router.push("/seller/dashboard");
      router.refresh();
      return;
    }
    setStep("form");
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const body = {
      displayName: String(formData.get("displayName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      taxNumber: String(formData.get("taxNumber") ?? ""),
      transactionAgentName: String(formData.get("transactionAgentName") ?? ""),
      email: String(formData.get("email") ?? ""),
      businessAddress: String(formData.get("businessAddress") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };

    const res = await fetch("/api/seller/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detailMsg =
        err?.details && typeof err.details === "object"
          ? JSON.stringify(err.details)
          : "";
      setError(`登録失敗: ${err.error ?? res.status} ${detailMsg}`);
      return;
    }
    setStep("done");
    router.refresh();
  }

  if (step === "connect") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Step 1. Wallet を接続</h2>
        <SiweConnect onConnected={handleConnected} />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">登録完了</h2>
        <p className="text-sm">
          ようこそ Tagamie へ。 Seller dashboard に移動します。
        </p>
        <a
          href="/seller/dashboard"
          className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Dashboard へ →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        署名済 wallet:{" "}
        <code className="font-mono">{address}</code>
      </div>

      <h2 className="text-lg font-medium">Step 2. 事業情報を入力</h2>

      <form
        action={(fd) => startTransition(() => handleSubmit(fd))}
        className="space-y-4"
      >
        <Field
          name="displayName"
          label="屋号 / 表示名"
          required
          placeholder="例: Tagamie"
        />
        <Field
          name="legalName"
          label="法人名 / 個人事業主氏名"
          required
          placeholder="例: 株式会社 ○○ / 山田 太郎"
        />
        <Field
          name="taxNumber"
          label="T 番号 (適格請求書発行事業者登録番号)"
          required
          placeholder="T1234567890123"
          pattern="^T\d{13}$"
        />
        <Field
          name="transactionAgentName"
          label="取引担当者氏名 (任意)"
          placeholder="法人の場合 JPYC 規約準拠で指定推奨"
        />
        <Field
          name="email"
          label="連絡先 Email (任意)"
          type="email"
          placeholder="contact@example.com"
        />
        <Field
          name="businessAddress"
          label="事業所所在地 (任意)"
          placeholder="東京都 ○○ 区 ..."
        />
        <Field
          name="industry"
          label="業種 (任意)"
          placeholder="例: ソフトウェア開発"
        />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required className="mt-1" />
          <span>
            <a
              href="/terms"
              target="_blank"
              className="underline"
              rel="noreferrer"
            >
              利用規約
            </a>{" "}
            および{" "}
            <a
              href="/privacy"
              target="_blank"
              className="underline"
              rel="noreferrer"
            >
              プライバシーポリシー
            </a>{" "}
            (いずれも準備中) に同意します
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? "登録中…" : "登録する"}
        </button>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  placeholder,
  pattern,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  pattern?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-200">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        pattern={pattern}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}
