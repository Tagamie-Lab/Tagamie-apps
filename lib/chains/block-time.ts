import "server-only";
import { createPublicClient, http } from "viem";

/**
 * Block-time resolution for ingest. We need the *block timestamp* (consensus
 * time of the transfer) as `settle_events.occurredAt` so that month-boundary
 * bucketing in [[lib/aggregation/queries]] is invariant to webhook latency.
 *
 * Without this, an Alchemy webhook delivered 02:00 UTC of day 1 would carry a
 * `Date.now()` that bucketed last-month's tx into this month's invoice.
 */

type DbChain =
  | "polygon"
  | "ethereum"
  | "base"
  | "kaia"
  | "polygonAmoy"
  | "kaiaKairos";

// Public RPCs by chain. Override with env when a private/paid endpoint is
// preferred (e.g. Alchemy/Infura) — public RPCs work for `eth_getBlockByNumber`
// but may rate-limit under load.
const RPC_BY_DB_CHAIN: Partial<Record<DbChain, string>> = {
  polygon: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
  polygonAmoy:
    process.env.POLYGON_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology",
  kaia: process.env.KAIA_RPC_URL ?? "https://public-en.node.kaia.io",
  kaiaKairos:
    process.env.KAIA_KAIROS_RPC_URL ?? "https://public-en-kairos.node.kaia.io",
  // ethereum / base intentionally unset — JPYC has no mainnet contract on
  // those rails for Tagamie scope; webhooks for them would be skipped upstream.
};

export async function fetchBlockTimestamp(
  dbChain: DbChain,
  blockNumber: bigint,
): Promise<Date | null> {
  const rpc = RPC_BY_DB_CHAIN[dbChain];
  if (!rpc) {
    // Defensive log so misconfigured env (e.g. JPYC contract address set for
    // a chain we have no RPC for) surfaces in the webhook output instead of
    // silently dropping the on-chain timestamp.
    console.warn(
      `[block-time] no RPC configured for chain=${dbChain} — occurredAt will fall back to received-time`,
    );
    return null;
  }
  try {
    const client = createPublicClient({ transport: http(rpc) });
    const block = await client.getBlock({ blockNumber });
    return new Date(Number(block.timestamp) * 1000);
  } catch (e) {
    console.warn(
      `[block-time] fetch failed chain=${dbChain} block=${blockNumber}`,
      e,
    );
    return null;
  }
}
