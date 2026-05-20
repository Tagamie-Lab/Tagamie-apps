"use client";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  isSupportedChainId,
  type SupportedChainId,
} from "./chains";

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
    };
  }
}

export type SiweSignInResult = {
  address: string;
  chainId: number;
};

async function ensureEthereum(): Promise<NonNullable<Window["ethereum"]>> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "Ethereum wallet not detected. Install MetaMask or another EIP-1193 wallet.",
    );
  }
  return window.ethereum;
}

async function requestAddress(options?: {
  forceAccountSelector?: boolean;
}): Promise<string> {
  const eth = await ensureEthereum();

  if (options?.forceAccountSelector) {
    // Force MetaMask to show the account picker even if a permission already
    // exists. Without this, MetaMask silently reuses the active account, which
    // makes it impossible to sign in with a *different* wallet from the same
    // browser session.
    try {
      await eth.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (e) {
      // User dismissed the picker; surface a friendly message.
      const code = (e as { code?: number })?.code;
      if (code === 4001) throw new Error("Account selection cancelled.");
      throw e;
    }
  }

  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  const raw = accounts?.[0];
  if (!raw) throw new Error("No wallet account selected.");
  // SIWE (EIP-4361) requires the address in EIP-55 checksum format.
  // `eth_requestAccounts` returns lowercase in some wallets — checksum here.
  return getAddress(raw);
}

async function getChainId(): Promise<number> {
  const eth = await ensureEthereum();
  const hex = (await eth.request({ method: "eth_chainId" })) as string;
  return parseInt(hex, 16);
}

/**
 * Ensure the wallet is on a Tagamie-supported chain. If the current chain
 * is not supported, prompt the user to switch to `targetChainId` (default:
 * Polygon Amoy testnet). Adds the chain if MetaMask doesn't know it yet.
 */
async function ensureSupportedChain(
  targetChainId: SupportedChainId = DEFAULT_CHAIN_ID,
): Promise<SupportedChainId> {
  const eth = await ensureEthereum();
  const current = await getChainId();
  if (isSupportedChainId(current)) {
    return current;
  }

  const target = CHAINS[targetChainId];
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainIdHex }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    // 4902 = chain not added to wallet → add it
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target.chainIdHex,
            chainName: target.name,
            nativeCurrency: target.nativeCurrency,
            rpcUrls: target.rpcUrls,
            blockExplorerUrls: target.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw new Error(
        `Tagamie は ${target.name} など限定的な chain でのみ動作します (現在: chainId=${current})。 MetaMask で ${target.name} に切り替えてください。`,
      );
    }
  }

  const after = await getChainId();
  if (!isSupportedChainId(after)) {
    throw new Error(
      `Chain switch failed (still on chainId=${after}). Please switch to ${target.name} manually.`,
    );
  }
  return after;
}

async function personalSign(
  message: string,
  address: string,
): Promise<`0x${string}`> {
  const eth = await ensureEthereum();
  const signature = (await eth.request({
    method: "personal_sign",
    params: [message, address],
  })) as `0x${string}`;
  return signature;
}

/**
 * Run the full SIWE handshake:
 * 1. Connect wallet
 * 2. Fetch nonce from server
 * 3. Build EIP-4361 message
 * 4. Sign with wallet
 * 5. POST to verify endpoint -> session cookie set
 */
export async function signInWithEthereum(options?: {
  forceAccountSelector?: boolean;
}): Promise<SiweSignInResult> {
  const address = await requestAddress({
    forceAccountSelector: options?.forceAccountSelector,
  });
  const chainId = await ensureSupportedChain();

  const nonceRes = await fetch("/api/auth/siwe/nonce", { method: "POST" });
  if (!nonceRes.ok) throw new Error("Failed to issue nonce");
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const domain = window.location.host;
  const origin = window.location.origin;

  // EIP-4361 restricts `statement` to ASCII printable chars (no Japanese / Unicode).
  // See ABNF in spec: https://eips.ethereum.org/EIPS/eip-4361#abnf-message-format
  const siwe = new SiweMessage({
    domain,
    address,
    statement: "Sign in to Tagamie with your Ethereum wallet.",
    uri: origin,
    version: "1",
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const message = siwe.prepareMessage();
  const signature = await personalSign(message, address);

  const verifyRes = await fetch("/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(`SIWE verify failed: ${err.error ?? verifyRes.status}`);
  }

  return { address: address.toLowerCase(), chainId };
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/siwe/logout", { method: "POST" });
}
