"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SiweConnect } from "@/components/siwe-connect";

const TERMS_VERSION = "2026-05-20-v1-draft";
const PRIVACY_VERSION = "2026-05-20-v1-draft";

type Step = "connect" | "form" | "done";

export function BuyerRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("connect");
  const [address, setAddress] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleConnected(result: { address: string; chainId: number }) {
    setAddress(result.address);
    // If this wallet is already registered, skip the form and go to dashboard
    const me = await fetch("/api/buyer/me").then((r) => r.json()).catch(() => null);
    if (me?.registered) {
      router.push("/buyer/dashboard");
      router.refresh();
      return;
    }
    setStep("form");
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const body = {
      businessName: String(formData.get("businessName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      email: String(formData.get("email") ?? ""),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };

    const res = await fetch("/api/buyer/register", {
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
          ようこそ Tagamie へ。 受領 invoice 一覧を確認できます。
        </p>
        <a
          href="/buyer/dashboard"
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
        署名済 wallet: <code className="font-mono">{address}</code>
      </div>

      <h2 className="text-lg font-medium">Step 2. 受領情報を入力 (任意項目)</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        個人事業主・個人 buyer の場合は空欄で構いません。 法人の場合は屋号 / 法人名を入力推奨。
      </p>

      <form
        action={(fd) => startTransition(() => handleSubmit(fd))}
        className="space-y-4"
      >
        <Field
          name="businessName"
          label="屋号 (任意)"
          placeholder="例: ○○ 事務所"
        />
        <Field
          name="legalName"
          label="法人名 (任意)"
          placeholder="例: 株式会社 ○○"
        />
        <Field
          name="email"
          label="連絡先 Email (任意、 PDF 通知用)"
          type="email"
          placeholder="contact@example.com"
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
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
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
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}
