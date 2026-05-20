import type { AgentConfig, BalanceSnapshot, McpClient } from "./types.js";

/** Sepolia STRK (starknet.js / MCP default) */
export const SEPOLIA_STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export interface TokenProfile {
  symbol: string;
  /** MCP token argument for starknet_get_balance / starknet_transfer */
  mcpToken: string;
  decimals: number;
}

export function resolveTokenProfile(config: AgentConfig): TokenProfile {
  if (config.token === "STRK") {
    return {
      symbol: "STRK",
      mcpToken: "STRK",
      decimals: 18,
    };
  }

  const address = config.spendingToken.address?.trim();
  if (
    !address ||
    address === "0x0" ||
    address.endsWith(
      "0000000000000000000000000000000000000000000000000000000000000000",
    )
  ) {
    throw new Error(
      "MTK profile requires spendingToken.address or SPENDING_TOKEN_ADDRESS env var",
    );
  }

  return {
    symbol: config.spendingToken.symbol || "MTK",
    mcpToken: address,
    decimals: 18,
  };
}

export async function fetchBalance(
  mcp: McpClient,
  accountAddress: string,
  profile: TokenProfile,
  config: AgentConfig,
): Promise<BalanceSnapshot> {
  if (config.token === "STRK") {
    const result = (await mcp.callTool("starknet_get_balance", {
      address: accountAddress,
      token: profile.mcpToken,
    })) as {
      address?: string;
      token?: string;
      tokenAddress?: string;
      balance?: string;
      raw?: string;
      decimals?: number;
    };

    return {
      address: result.address ?? accountAddress,
      token: profile.symbol,
      tokenAddress: result.tokenAddress,
      balance: result.balance ?? "0",
      raw: result.raw,
      decimals: result.decimals ?? profile.decimals,
    };
  }

  const contractAddress = profile.mcpToken;
  const callResult = (await mcp.callTool("starknet_call_contract", {
    contractAddress,
    entrypoint: "balance_of",
    calldata: [accountAddress],
  })) as { result?: unknown };

  const balance = parseU256Balance(callResult.result);
  const fallback = (await mcp.callTool("starknet_get_balance", {
    address: accountAddress,
    token: contractAddress,
  })) as { balance?: string; raw?: string; decimals?: number };

  return {
    address: accountAddress,
    token: profile.symbol,
    tokenAddress: contractAddress,
    balance: fallback.balance ?? balance,
    raw: fallback.raw,
    decimals: fallback.decimals ?? profile.decimals,
  };
}

export async function fetchOnChainTransferLimit(
  mcp: McpClient,
  contractAddress: string,
): Promise<string | undefined> {
  const result = (await mcp.callTool("starknet_call_contract", {
    contractAddress,
    entrypoint: "get_transfer_limit",
    calldata: [],
  })) as { result?: unknown };

  const parsed = parseU256Balance(result.result);
  if (
    parsed === "0" &&
    Array.isArray(result.result) &&
    result.result.length >= 2
  ) {
    return parseU256FromFelts(result.result as string[]);
  }
  return parsed;
}

function parseU256Balance(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) return parseU256FromFelts(result.map(String));
  if (result && typeof result === "object" && "low" in result) {
    const obj = result as { low?: string | number; high?: string | number };
    const low = BigInt(obj.low ?? 0);
    const high = BigInt(obj.high ?? 0);
    return ((high << BigInt(128)) | low).toString();
  }
  return "0";
}

function parseU256FromFelts(felts: string[]): string {
  if (felts.length === 0) return "0";
  if (felts.length === 1) return BigInt(felts[0]).toString();
  const low = BigInt(felts[0]);
  const high = BigInt(felts[1]);
  return ((high << BigInt(128)) | low).toString();
}

export function transferTokenArg(profile: TokenProfile): string {
  return profile.mcpToken;
}
