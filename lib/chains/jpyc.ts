/**
 * JPYC contract addresses across supported chains.
 *
 * - Mainnet addresses are from JPYC official docs / pre-contract disclosure.
 * - Testnet addresses are placeholders to be filled when JPYC publishes
 *   testnet contracts (or when we deploy our own mock JPYC ERC-20 on Amoy /
 *   Kairos for E2E testing during Path B Phase 0-A).
 *
 * Reference: [[jpyc-pre-contract-disclosure]] §1.1 + [[kaia]] for ChainID.
 */

import type { SupportedChainId } from "@/lib/auth/chains";

type DbChain =
  | "polygon"
  | "ethereum"
  | "base"
  | "kaia"
  | "polygonAmoy"
  | "kaiaKairos";

export interface JpycChainConfig {
  chainId: SupportedChainId | number; // testnets included
  dbChain: DbChain;
  jpycAddress: `0x${string}` | null;
  isTestnet: boolean;
}

export const JPYC_BY_CHAIN_ID: Record<number, JpycChainConfig> = {
  137: {
    chainId: 137,
    dbChain: "polygon",
    jpycAddress: "0x431d5dff03120afa4bdf332c61a6e1766ef37bdb",
    isTestnet: false,
  },
  8217: {
    chainId: 8217,
    dbChain: "kaia",
    jpycAddress: "0xe7c3d8c9a439fede00d2600032d5db0be71c3c29",
    isTestnet: false,
  },
  80002: {
    // Polygon Amoy testnet
    chainId: 80002,
    dbChain: "polygonAmoy",
    // No official JPYC on Amoy yet. Will be set when:
    //   (a) JPYC publishes a testnet contract, OR
    //   (b) Tagamie deploys a mock ERC-20 for E2E testing.
    jpycAddress: (process.env.JPYC_AMOY_ADDRESS as `0x${string}`) ?? null,
    isTestnet: true,
  },
  1001: {
    // Kaia Kairos testnet
    chainId: 1001,
    dbChain: "kaiaKairos",
    jpycAddress: (process.env.JPYC_KAIROS_ADDRESS as `0x${string}`) ?? null,
    isTestnet: true,
  },
};

export function findJpycByContract(
  contractAddress: string,
): JpycChainConfig | null {
  const target = contractAddress.toLowerCase();
  for (const cfg of Object.values(JPYC_BY_CHAIN_ID)) {
    if (cfg.jpycAddress?.toLowerCase() === target) return cfg;
  }
  return null;
}
