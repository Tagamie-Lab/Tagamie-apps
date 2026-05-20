/**
 * Supported chains for Tagamie SIWE login.
 *
 * Phase 0-A (testnet): Polygon Amoy + Kaia Kairos
 * Phase 0-C (mainnet self-loop): Polygon + Kaia
 *
 * The server-side verify route also enforces this list. See
 * [[tagamie-pre-release-deploy]] for the L1/L2/L3 boundary.
 */

export type SupportedChainId = 80002 | 1001 | 137 | 8217;

export interface ChainConfig {
  chainId: SupportedChainId;
  chainIdHex: string;
  name: string;
  isTestnet: boolean;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export const CHAINS: Record<SupportedChainId, ChainConfig> = {
  80002: {
    chainId: 80002,
    chainIdHex: "0x13882",
    name: "Polygon Amoy",
    isTestnet: true,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrls: ["https://amoy.polygonscan.com"],
  },
  1001: {
    chainId: 1001,
    chainIdHex: "0x3e9",
    name: "Kaia Kairos",
    isTestnet: true,
    nativeCurrency: { name: "KAIA", symbol: "KAIA", decimals: 18 },
    rpcUrls: ["https://public-en-kairos.node.kaia.io"],
    blockExplorerUrls: ["https://kairos.kaiascan.io"],
  },
  137: {
    chainId: 137,
    chainIdHex: "0x89",
    name: "Polygon",
    isTestnet: false,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrls: ["https://polygonscan.com"],
  },
  8217: {
    chainId: 8217,
    chainIdHex: "0x2019",
    name: "Kaia",
    isTestnet: false,
    nativeCurrency: { name: "KAIA", symbol: "KAIA", decimals: 18 },
    rpcUrls: ["https://public-en.node.kaia.io"],
    blockExplorerUrls: ["https://kaiascan.io"],
  },
};

export const DEFAULT_CHAIN_ID: SupportedChainId = 80002; // Polygon Amoy

export function isSupportedChainId(id: number): id is SupportedChainId {
  return id in CHAINS;
}
