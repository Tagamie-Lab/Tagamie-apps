# Tagamie

> **お互いにクリアな世界へ。** / *Clarity for everyone.*

x402 マイクロペイメントを JP 適格請求書制度に最適化した usage-based billing SaaS。
seller・buyer・税務署の三方が、同じ取引を、同じ精度で見る。

## What is Tagamie

- **語源**: 互い見え（tagai-mie → tagamie）
- **思想**: 近江商人「三方良し」のデジタル版
- **機能**: x402 settle event → 月次合算 → 適格請求書 PDF → freee 自動仕訳

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- shadcn/ui (base preset)
- Supabase (Postgres + Auth + Storage)
- Inngest (durable workflow)
- Drizzle ORM
- Vercel (hosting)

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## License

Proprietary. © 2026 Tagamie.
